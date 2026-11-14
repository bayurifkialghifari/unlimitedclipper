import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { root } from './cargo.mjs';
import { testEngine } from './test-engine.mjs';
import { toolDirectory } from './test-paths.mjs';

// Reuse real recognition from a local project without changing its library or models.
const projectId = process.argv[2];
assert.ok(
  projectId,
  'Usage: node scripts/validate-discovery.mjs PROJECT_ID [START_MS] [DURATION_MS]',
);
const canonical = new DatabaseSync(path.join(root, '.data/studio.sqlite'), { readOnly: true });
const stored = canonical.prepare('SELECT data FROM projects WHERE id = ?').get(projectId);
assert.ok(stored, 'Choose an imported local project with a real transcript.');
const original = JSON.parse(stored.data);
assert.ok(original.words.length > 0);
const asset = canonical
  .prepare('SELECT relative_path FROM assets WHERE id = ?')
  .get(original.asset_id);
const start = Number(process.argv[3] ?? original.words[0].start_ms);
const duration = Number(process.argv[4] ?? 180000);
assert.ok(Number.isInteger(start) && start >= 0);
assert.ok(
  Number.isInteger(duration) && duration >= 8000 && start + duration <= original.duration_ms,
);
const source = path.resolve(root, '.data', asset.relative_path);
assert.ok(source.startsWith(path.resolve(root, '.data') + path.sep));
canonical.close();

const engine = await testEngine();
try {
  const fixture = path.join(engine.directory, 'podcast-excerpt.mp4');
  execFileSync(
    path.join(toolDirectory, 'ffmpeg/ffmpeg.exe'),
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(start / 1000),
      '-i',
      source,
      '-t',
      String(duration / 1000),
      '-vf',
      'scale=-2:480',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '27',
      '-c:a',
      'aac',
      fixture,
    ],
    { windowsHide: true, stdio: 'inherit', timeout: 120000 },
  );
  const imported = await engine.wait(await engine.api('/imports/local', { path: fixture }));
  const response = await engine.api('/projects/' + imported.project_id);
  const project = response.project;
  project.words = original.words
    .filter((word) => word.start_ms >= start && word.end_ms <= start + duration)
    .map((word) => ({ ...word, start_ms: word.start_ms - start, end_ms: word.end_ms - start }));
  project.language = original.language;
  const preferences = await engine.api('/settings');
  preferences.ai_mode = 'economy';
  preferences.speech_model = 'whisper-small';
  preferences.resolution = 720;
  await engine.api('/settings', preferences, 'PUT');
  project.transcript_configuration = 'whisper-small:auto:parser-v2';
  const database = new DatabaseSync(path.join(engine.directory, 'studio.sqlite'));
  database
    .prepare('UPDATE projects SET data = ? WHERE id = ?')
    .run(JSON.stringify(project), project.id);
  database.close();
  const admission = await engine.api('/projects/' + project.id + '/generate', {
    clip_count: 4,
    duration_ms: 0,
    language: 'auto',
    minimum_score: 70,
    focus: '',
    content_profile: 'podcast',
  });
  console.log(
    JSON.stringify({ directory: engine.directory, job: admission.id, words: project.words.length }),
  );
  const started = Date.now();
  let completed;
  let peak = 0;
  const samples = [];
  while (Date.now() - started < 15 * 60000) {
    const job = (await engine.api('/jobs')).find((item) => item.id === admission.id);
    assert.ok(!['failed', 'cancelled'].includes(job.status), job.error ?? job.message);
    if (process.platform === 'win32') {
      const command =
        `$items = @(Get-CimInstance Win32_Process); $ids = @(${engine.pid}); ` +
        'for ($i = 0; $i -lt 3; $i++) { $ids += @($items | Where-Object { $ids -contains $_.ParentProcessId } | ForEach-Object { $_.ProcessId }) }; ' +
        '@($items | Where-Object { $ids -contains $_.ProcessId } | ForEach-Object { ' +
        '[pscustomobject]@{ name=$_.Name; bytes=[long]$_.WorkingSetSize } }) | ConvertTo-Json -Compress';
      const measurement = JSON.parse(
        execFileSync('powershell.exe', ['-NoProfile', '-Command', command], {
          windowsHide: true,
          encoding: 'utf8',
          timeout: 15000,
        }),
      );
      const processes = Array.isArray(measurement) ? measurement : [measurement];
      peak = Math.max(
        peak,
        processes.reduce((total, item) => total + item.bytes, 0),
      );
      samples.push({ elapsed_ms: Date.now() - started, stage: job.stage, processes });
    }
    console.log(
      JSON.stringify({
        stage: job.stage,
        offset: job.payload.discovery_window_offset,
        review: job.payload.discovery_review_offset,
        elapsed_ms: Date.now() - started,
      }),
    );
    if (job.status === 'completed') {
      completed = job;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.ok(completed, 'Discovery exceeded its validation deadline.');
  assert.equal(completed.payload.proposal_model, 'qwen3-1.7b');
  assert.equal(completed.payload.review_model, 'qwen3-4b');
  assert.equal(completed.payload.inference_context, 4096);
  assert.ok(completed.payload.discovery_report.model_loads <= 4);
  assert.ok((completed.payload.discovery_report.extra_windows ?? 0) <= 8);
  const clips = (await engine.api('/projects/' + project.id)).clips;
  assert.ok(clips.length <= 4);
  for (const clip of clips) {
    assert.ok(clip.score >= 70);
    assert.ok(clip.document.end_ms - clip.document.start_ms <= 60000);
    const review = completed.payload.discovery_reviews.find(
      (item) => item.start_ms === clip.document.start_ms && item.end_ms === clip.document.end_ms,
    );
    assert.ok(review, 'Every persisted clip must match its reviewed boundaries.');
    const text = project.words
      .filter((word) => word.end_ms > review.start_ms && word.start_ms < review.end_ms)
      .map((word) => word.text)
      .join(' ');
    assert.equal(
      review.dimensions.reduce((total, item) => total + item.score, 0),
      clip.score,
    );
    assert.ok(review.dimensions.every((item) => text.includes(item.quote) && item.score >= 10));
  }
  const db = new DatabaseSync(path.join(engine.directory, 'studio.sqlite'));
  const failed = {
    ...completed,
    status: 'failed',
    error: 'Controlled interruption after insertion.',
  };
  db.prepare('UPDATE jobs SET status = ?, data = ? WHERE id = ?').run(
    'failed',
    JSON.stringify(failed),
    completed.id,
  );
  db.close();
  const retried = await engine.wait(await engine.api('/jobs/' + completed.id + '/retry', {}));
  assert.equal(retried.payload.inference_calls, completed.payload.inference_calls);
  assert.deepEqual(
    (await engine.api('/projects/' + project.id)).clips.map((clip) => clip.id),
    clips.map((clip) => clip.id),
  );
  const evidence = {
    source: original.name,
    source_start_ms: start,
    duration_ms: duration,
    reused_recognition: true,
    words: project.words.length,
    elapsed_ms: Date.now() - started,
    peak_process_tree_working_set: peak,
    report: completed.payload.discovery_report,
    inference_calls: completed.payload.inference_calls,
    proposal_model: completed.payload.proposal_model,
    review_model: completed.payload.review_model,
    directory: engine.directory,
    clips: clips.map((clip) => ({ id: clip.id, score: clip.score, name: clip.name })),
    retry_preserved_clips: true,
    samples,
  };
  await writeFile('.cache/economy-discovery-validation.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ...evidence, samples: undefined }));
} finally {
  await engine.stop();
}
