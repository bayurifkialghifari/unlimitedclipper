import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { testEngine } from './test-engine.mjs';
import { toolDirectory } from './test-paths.mjs';

assert.ok(process.argv[2], 'Pass the completed isolated discovery directory.');
const engine = await testEngine(43186, { existingDirectory: process.argv[2] });
try {
  let jobs = await engine.api('/jobs');
  const generated = jobs.find(
    (job) =>
      job.kind === 'generate' && job.status === 'completed' && job.payload.qualifying_moments > 0,
  );
  assert.ok(generated, 'Real discovery must finish before export validation.');
  const refinements = jobs.filter(
    (job) => job.kind === 'captions' && job.payload.discovery_parent === generated.id,
  );
  for (const job of refinements) {
    if (['failed', 'cancelled'].includes(job.status)) {
      await engine.api('/jobs/' + job.id + '/retry', {});
    }
    await engine.wait(job);
  }
  const project = await engine.api('/projects/' + generated.project_id);
  let clip = project.clips.find((clip) => clip.id === generated.payload.plan[0].id);
  assert.ok(clip);
  clip.document.resolution = 720;
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const tracked = await engine.wait(
    await engine.api('/clips/' + clip.id + '/track', {
      mode: 'split',
      revision: clip.revision,
    }),
  );
  clip = await engine.api('/clips/' + clip.id);
  const exported = await engine.wait(await engine.api('/clips/' + clip.id + '/export', {}));
  const record = (await engine.api('/exports')).find(
    (record) => record.id === exported.payload.completed_exports[0].export_id,
  );
  assert.equal(record.revision, clip.revision);
  const database = new DatabaseSync(path.join(engine.directory, 'studio.sqlite'));
  const videoAsset = database
    .prepare('SELECT relative_path FROM assets WHERE id = ?')
    .get(record.asset_id);
  const output = path.join(engine.directory, videoAsset.relative_path);
  const probe = JSON.parse(
    execFileSync(
      path.join(toolDirectory, 'ffmpeg/ffprobe.exe'),
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output],
      { encoding: 'utf8', windowsHide: true },
    ),
  );
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  assert.equal(video.width, 720);
  assert.equal(video.height, 1280);
  const expected = clip.document.segments?.length
    ? clip.document.segments.reduce(
        (total, segment) => total + segment.end_ms - segment.start_ms,
        0,
      )
    : clip.document.end_ms - clip.document.start_ms;
  assert.ok(Math.abs(Number(probe.format.duration) * 1000 - expected) <= 100);
  execFileSync(
    path.join(toolDirectory, 'ffmpeg/ffmpeg.exe'),
    ['-v', 'error', '-i', output, '-f', 'null', '-'],
    {
      windowsHide: true,
      stdio: 'inherit',
      timeout: 120000,
    },
  );
  execFileSync(
    path.join(toolDirectory, 'ffmpeg/ffmpeg.exe'),
    [
      '-v',
      'error',
      '-y',
      '-ss',
      '1',
      '-i',
      output,
      '-frames:v',
      '1',
      '.cache/economy-natural-export.png',
    ],
    { windowsHide: true, stdio: 'inherit', timeout: 30000 },
  );
  const interrupted = {
    ...exported,
    status: 'failed',
    error: 'Controlled interruption after export commit.',
  };
  database
    .prepare('UPDATE jobs SET status = ?, data = ? WHERE id = ?')
    .run('failed', JSON.stringify(interrupted), exported.id);
  database.close();
  await engine.wait(await engine.api('/jobs/' + exported.id + '/retry', {}));
  assert.equal(
    (await engine.api('/exports')).filter((record) => record.clip_id === clip.id).length,
    1,
  );
  jobs = await engine.api('/jobs');
  const evidence = {
    source: project.project.name,
    clip: clip.name,
    score: clip.score,
    revision: clip.revision,
    duration_ms: expected,
    width: video.width,
    height: video.height,
    output,
    full_decode: true,
    export_retry_preserved_record: true,
    tracking: tracked.payload.tracking_report,
    automatic_refinement_jobs: refinements.length,
    refinements_completed: refinements.every(
      (job) => jobs.find((item) => item.id === job.id)?.status === 'completed',
    ),
  };
  await writeFile(
    '.cache/economy-natural-export-validation.json',
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
} finally {
  await engine.stop();
}
