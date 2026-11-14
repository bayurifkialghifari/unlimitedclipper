import assert from 'node:assert/strict';
import { copyFile, link, mkdir, readdir, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { root } from './cargo.mjs';
import { testEngine } from './test-engine.mjs';

const id = process.argv[2];
assert.ok(id, 'Pass the ID of an existing real transcribed project.');
const canonicalRoot = path.join(root, '.data');
const canonical = new DatabaseSync(path.join(canonicalRoot, 'studio.sqlite'), { readOnly: true });
const stored = canonical.prepare('SELECT data FROM projects WHERE id = ?').get(id);
assert.ok(stored);
const project = JSON.parse(stored.data);
const assets = [project.asset_id, project.preview_asset_id, project.thumbnail_id]
  .filter(Boolean)
  .map((id) => canonical.prepare('SELECT * FROM assets WHERE id = ?').get(id));
canonical.close();
const existingDirectory = process.argv[3];
const engine = await testEngine(43186, { existingDirectory });
try {
  if (!existingDirectory) {
    const db = new DatabaseSync(path.join(engine.directory, 'studio.sqlite'));
    for (const asset of assets) {
      const source = path.resolve(canonicalRoot, asset.relative_path);
      const destination = path.resolve(engine.directory, asset.relative_path);
      assert.ok(source.startsWith(canonicalRoot + path.sep));
      assert.ok(destination.startsWith(engine.directory + path.sep));
      await mkdir(path.dirname(destination), { recursive: true });
      await link(source, destination);
      db.prepare('INSERT INTO assets(id,relative_path,name,kind,created_at) VALUES(?,?,?,?,?)').run(
        asset.id,
        asset.relative_path,
        asset.name,
        asset.kind,
        asset.created_at,
      );
    }
    db.prepare('INSERT INTO projects(id,data,created_at) VALUES(?,?,?)').run(
      project.id,
      stored.data,
      project.created_at,
    );
    db.close();
    await copyFile(
      path.join(canonicalRoot, 'temporary', id + '-transcript.json'),
      path.join(engine.directory, 'temporary', id + '-transcript.json'),
    );
  }
  const preferences = await engine.api('/settings');
  await engine.api(
    '/settings',
    { ...preferences, speech_model: 'whisper-small', resolution: 720, ai_mode: 'economy' },
    'PUT',
  );
  const previous = existingDirectory
    ? (await engine.api('/jobs')).find((job) => job.kind === 'generate')
    : null;
  const admission =
    previous && ['failed', 'cancelled'].includes(previous.status)
      ? await engine.api('/jobs/' + previous.id + '/retry', {})
      : await engine.api('/projects/' + id + '/generate', {
          clip_count: 4,
          duration_ms: 0,
          language: 'auto',
          minimum_score: 70,
          content_profile: 'podcast',
          focus: '',
        });
  console.log(
    JSON.stringify({ directory: engine.directory, job: admission.id, source: project.name }),
  );
  const started = Date.now();
  let cancelled = false;
  let completed;
  let restored;
  while (Date.now() - started < 30 * 60000) {
    const job = (await engine.api('/jobs')).find((item) => item.id === admission.id);
    assert.notEqual(job.status, 'failed', job.error);
    if (!cancelled && job.payload.discovery_snapshot) {
      restored = (await engine.api('/projects/' + id)).project;
      assert.ok(restored.words.length > project.words.length);
      assert.ok(restored.words.at(-1).end_ms > project.duration_ms * 0.9);
      assert.equal(restored.transcript_configuration, 'whisper-small:auto:parser-v2');
      await engine.api('/jobs/' + job.id + '/cancel', {});
      cancelled = true;
      console.log(
        JSON.stringify({
          restored_words: restored.words.length,
          previous_words: project.words.length,
        }),
      );
    } else if (job.status === 'cancelled') {
      assert.ok(
        !(await readdir(path.join(engine.directory, 'temporary'))).some((name) =>
          name.endsWith('-inference.key'),
        ),
      );
      await engine.api('/jobs/' + job.id + '/retry', {});
    } else if (job.status === 'completed') {
      completed = job;
      break;
    }
    console.log(
      JSON.stringify({
        stage: job.stage,
        status: job.status,
        section: job.payload.selection_section,
        total: job.payload.selection_sections,
        elapsed_ms: Date.now() - started,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.ok(completed, 'Complete discovery exceeded its validation deadline.');
  const clips = (await engine.api('/projects/' + id)).clips;
  assert.ok(
    clips.length > 0 && clips.length <= 4,
    'The real conversation must yield usable grounded cuts.',
  );
  for (const clip of clips) {
    assert.ok(clip.score >= 70);
    const review = completed.payload.discovery_reviews.find(
      (item) => item.start_ms === clip.document.start_ms && item.end_ms === clip.document.end_ms,
    );
    assert.ok(review, 'Persisted boundaries must match the independent review.');
    const text = restored.words
      .filter((word) => word.end_ms > review.start_ms && word.start_ms < review.end_ms)
      .map((word) => word.text)
      .join(' ');
    assert.ok(review.dimensions.every((item) => item.score >= 10 && text.includes(item.quote)));
    assert.equal(
      review.dimensions.reduce((total, item) => total + item.score, 0),
      clip.score,
    );
    assert.ok(clip.document.end_ms - clip.document.start_ms >= 8000);
    assert.ok(clip.document.end_ms - clip.document.start_ms <= 60000);
  }
  const evidence = {
    source: project.name,
    duration_ms: project.duration_ms,
    previous_words: project.words.length,
    restored_words: restored.words.length,
    restored_last_ms: restored.words.at(-1).end_ms,
    reused_recognition: true,
    cancellation_stopped_server: true,
    retry_completed: true,
    reviewed_boundaries_match: true,
    elapsed_ms: Date.now() - started,
    directory: engine.directory,
    report: completed.payload.discovery_report,
    inference_calls: completed.payload.inference_calls,
    clips: clips.map((clip) => ({
      id: clip.id,
      name: clip.name,
      score: clip.score,
      start_ms: clip.document.start_ms,
      end_ms: clip.document.end_ms,
    })),
  };
  await writeFile(
    '.cache/economy-complete-discovery-validation.json',
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
} finally {
  await engine.stop();
}
