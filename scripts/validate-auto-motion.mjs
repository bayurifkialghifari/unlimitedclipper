import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';
import { fixtureDirectory, toolDirectory } from './test-paths.mjs';
import { testEngine } from './test-engine.mjs';

async function runBrowser(origin, clipId) {
  const child = spawn(
    process.execPath,
    [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', 'auto-motion.spec.ts'],
    {
      cwd: root,
      windowsHide: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        UC_TEST_ORIGIN: origin,
        UC_TEST_AUTO_MOTION_CLIP_ID: clipId,
      },
    },
  );
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  assert.equal(exitCode, 0, 'Auto Motion browser interactions must pass.');
}

const port = 43198;
let engine = await testEngine(port);
const directory = engine.directory;
const started = Date.now();
try {
  const models = await engine.api('/models');
  assert.ok(models.some((model) => model.id === 'qwen3-4b' && model.ready));
  assert.ok(models.some((model) => model.id === 'whisper-small' && model.ready));
  const imported = await engine.wait(
    await engine.api('/imports/local', {
      path: path.join(fixtureDirectory, 'speech-face.mp4'),
    }),
  );
  let clip = await engine.api('/projects/' + imported.project_id + '/clips', {
    name: 'Auto Motion media fixture',
    start_ms: 0,
    end_ms: 12000,
  });
  await engine.wait(
    await engine.api('/clips/' + clip.id + '/captions', {
      revision: clip.revision,
      speech_model: 'whisper-small',
      language: 'en',
      vocabulary: '',
    }),
  );
  clip = await engine.api('/clips/' + clip.id);
  assert.ok(clip.document.words.length > 8);
  const crop = clip.document.crop;
  clip.document.keyframes = [
    { time_ms: 0, x: crop.x, y: crop.y },
    { time_ms: 9000, x: Math.min(1 - crop.width, crop.x + 0.06), y: crop.y },
  ];
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const job = await engine.wait(
    await engine.api('/clips/' + clip.id + '/auto-edit', {
      revision: clip.revision,
      profile: 'editorial',
      remove_silence: false,
      auto_motion: true,
    }),
  );
  const proposed = job.payload.proposed_document;
  assert.equal(job.payload.base_revision, clip.revision);
  assert.ok(job.payload.motion_review.anchors >= 2);
  assert.equal(proposed.camera_motion.length, job.payload.motion_review.anchors);
  assert.equal(proposed.version, 4);
  assert.deepEqual(proposed.keyframes, []);
  assert.deepEqual(await engine.api('/clips/' + clip.id), clip);
  await engine.stop();
  engine = await testEngine(port, { existingDirectory: directory });
  const retained = await engine.api('/clips/' + clip.id + '/auto-edit');
  assert.equal(retained.id, job.id);
  const stale = await fetch(engine.origin + '/api/v1/clips/' + clip.id + '/auto-edit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      revision: clip.revision - 1,
      profile: 'editorial',
      remove_silence: false,
      auto_motion: true,
    }),
  });
  assert.equal(stale.status, 409);
  const settings = await engine.api('/settings');
  await engine.api('/settings', { ...settings, language: 'en' }, 'PUT');
  await runBrowser(engine.origin, clip.id);
  const applied = await engine.api('/clips/' + clip.id);
  assert.ok(applied.revision > clip.revision);
  assert.equal(applied.document.camera_motion.length, proposed.camera_motion.length);
  const exportJob = await engine.wait(await engine.api('/clips/' + clip.id + '/export', {}));
  const exportId = exportJob.payload.completed_exports[0].export_id;
  const output = path.join(directory, 'exports', exportId + '.mp4');
  execFileSync(
    path.join(toolDirectory, 'ffmpeg/ffmpeg.exe'),
    ['-v', 'error', '-i', output, '-f', 'null', '-'],
    { windowsHide: true, timeout: 120000 },
  );
  const evidence = {
    clip_id: clip.id,
    base_revision: clip.revision,
    applied_revision: applied.revision,
    proposal_anchors: proposed.camera_motion.length,
    proposal_preserved_after_restart: true,
    source_edit_unchanged_by_generation: true,
    stale_revision_rejected: true,
    browser_undo_redo: true,
    export_full_decode: true,
    elapsed_ms: Date.now() - started,
    data_directory: directory,
  };
  await writeFile(
    path.join(root, '.cache/auto-motion-validation.json'),
    JSON.stringify(evidence, null, 2) + String.fromCharCode(10),
  );
  process.stdout.write(JSON.stringify(evidence, null, 2) + String.fromCharCode(10));
} finally {
  await engine.stop();
}
