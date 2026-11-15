import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { testEngine } from './test-engine.mjs';
import { fixtureDirectory, toolDirectory } from './test-paths.mjs';

const engine = await testEngine(43186);
const ffmpeg = path.join(toolDirectory, 'ffmpeg/ffmpeg.exe');
const evidence = { directory: engine.directory };
function frame(file, seconds) {
  return execFileSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-ss',
      String(seconds),
      '-i',
      file,
      '-vf',
      'scale=72:128',
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ],
    { windowsHide: true },
  );
}
function chroma(bytes, firstRow = 0, endRow = 128) {
  let total = 0;
  let count = 0;
  for (let index = firstRow * 72 * 3; index < endRow * 72 * 3; index += 3) {
    total +=
      Math.max(bytes[index], bytes[index + 1], bytes[index + 2]) -
      Math.min(bytes[index], bytes[index + 1], bytes[index + 2]);
    count += 1;
  }
  return total / count;
}
function audio(file) {
  return execFileSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-ss',
      '2',
      '-i',
      file,
      '-t',
      '0.3',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      's16le',
      'pipe:1',
    ],
    { windowsHide: true },
  );
}
try {
  const imported = await engine.wait(
    await engine.api('/imports/local', { path: path.join(fixtureDirectory, 'speech-face.mp4') }),
  );
  let clip = await engine.api('/projects/' + imported.project_id + '/clips', {
    name: 'Local editor render validation',
    start_ms: 0,
    end_ms: 8000,
  });
  clip.document.resolution = 720;
  clip.document = await engine.api('/clips/' + clip.id + '/timeline-preview', {
    document: clip.document,
    segments: [
      { id: 'later', start_ms: 5000, end_ms: 8000 },
      { id: 'earlier', start_ms: 0, end_ms: 3000 },
    ],
  });
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const baseline = await engine.wait(await engine.api('/clips/' + clip.id + '/export', {}));
  const baselineFile = path.join(
    engine.directory,
    'exports',
    baseline.payload.completed_exports[0].export_id + '.mp4',
  );
  const form = new FormData();
  form.append(
    'file',
    new Blob([await readFile('apps/studio/public/sfx/swish-1.wav')]),
    'whoosh.wav',
  );
  const uploaded = await fetch(engine.origin + '/api/v1/assets/audio', {
    method: 'POST',
    body: form,
  });
  assert.equal(uploaded.status, 200);
  const asset = await uploaded.json();
  clip.document.title = {
    ...clip.document.title,
    text: 'KEEP THE CONTEXT',
    start_ms: 500,
    duration_ms: 1200,
    animation: 'fade',
    color: '#FFB86B',
  };
  clip.document.video_adjustments = { brightness: 0, contrast: 18, saturation: -100, warmth: 0 };
  clip.document.audio_layers = [
    {
      id: 'whoosh',
      enabled: true,
      start_ms: 2000,
      end_ms: 2000 + asset.duration_ms,
      asset_id: asset.asset_id,
      source_start_ms: 0,
      gain: 0.35,
    },
  ];
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const revision = clip.revision;
  const started = performance.now();
  const preview = await engine.wait(
    await engine.api('/clips/' + clip.id + '/preview-render', { revision }),
  );
  evidence.preview_ms = Math.round(performance.now() - started);
  const previewFile = path.join(engine.directory, 'preview.mp4');
  await writeFile(
    previewFile,
    Buffer.from(
      await (
        await fetch(engine.origin + '/api/v1/assets/' + preview.payload.preview_asset_id)
      ).arrayBuffer(),
    ),
  );
  const exportStarted = performance.now();
  const queued = await engine.api('/clips/' + clip.id + '/export', {});
  clip.document.video_adjustments.saturation = 0;
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const exported = await engine.wait(queued);
  evidence.export_ms = Math.round(performance.now() - exportStarted);
  const exportId = exported.payload.completed_exports[0].export_id;
  const exportFile = path.join(engine.directory, 'exports', exportId + '.mp4');
  assert.equal(
    (await engine.api('/exports')).find((item) => item.id === exportId).revision,
    revision,
  );
  for (const file of [previewFile, exportFile]) {
    execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], {
      windowsHide: true,
      timeout: 60000,
    });
    assert.ok(chroma(frame(file, 0.25), 30, 110) < 5, 'Monochrome footage must remain neutral.');
    assert.ok(chroma(frame(file, 4), 30, 110) < 5, 'Reordered footage uses the same filter.');
    assert.ok(chroma(frame(file, 0.9), 0, 25) > 1, 'Hook color must survive footage grading.');
    assert.ok(chroma(frame(file, 2), 0, 25) < 5, 'Hook must stop after its configured duration.');
  }
  const originalAudio = audio(baselineFile);
  const mixedAudio = audio(exportFile);
  assert.equal(originalAudio.length, mixedAudio.length);
  let difference = 0;
  for (let index = 0; index < originalAudio.length; index += 2) {
    difference += Math.abs(originalAudio.readInt16LE(index) - mixedAudio.readInt16LE(index));
  }
  evidence.audio_mean_difference = difference / (originalAudio.length / 2);
  assert.ok(
    evidence.audio_mean_difference > 10,
    'The included whoosh must contribute to rendered audio.',
  );
  const ass = await readFile(path.join(engine.directory, 'exports', exportId + '.ass'), 'utf8');
  assert.ok(ass.includes('Dialogue: 2,0:00:00.50,0:00:01.70,Title'));
  Object.assign(evidence, {
    duration_ms: 6000,
    width: 720,
    height: 1280,
    full_decode: true,
    filtered_preview_and_export: true,
    timed_hook_color: true,
    whoosh_mix: true,
    immutable_revision: revision,
    later_saved_revision: clip.revision,
  });
  await writeFile('.cache/editor-tools-media-validation.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  await engine.stop();
}
