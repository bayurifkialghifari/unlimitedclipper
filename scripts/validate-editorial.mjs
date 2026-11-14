import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { testEngine } from './test-engine.mjs';
import { fixtureDirectory, toolDirectory } from './test-paths.mjs';
import { root } from './cargo.mjs';

const test = await testEngine();
const evidence = { multi_cut: false, preview: false, layers: false, conflicts: false };
try {
  const form = new FormData();
  form.append(
    'file',
    new Blob([await readFile(path.join(fixtureDirectory, 'jfk.wav'))]),
    'speech.wav',
  );
  const uploaded = await fetch(test.origin + '/api/v1/assets/audio', {
    method: 'POST',
    body: form,
  });
  assert.equal(uploaded.status, 200);
  const audioAsset = await uploaded.json();
  assert.ok(audioAsset.duration_ms > 6000);
  assert.equal((await test.api('/assets/audio'))[0].asset_id, audioAsset.asset_id);
  const imported = await test.wait(
    await test.api('/imports/local', {
      path: path.join(fixtureDirectory, 'speech-face.mp4'),
    }),
  );
  const clip = await test.api('/projects/' + imported.project_id + '/clips', {
    name: 'Editorial timing validation',
    start_ms: 0,
    end_ms: 8000,
  });
  clip.document.resolution = 720;
  clip.document.segments = [
    { start_ms: 0, end_ms: 3000 },
    { start_ms: 5000, end_ms: 8000 },
  ];
  clip.document.visual_layers = [
    {
      id: 'note',
      kind: 'note',
      enabled: true,
      start_ms: 500,
      end_ms: 1500,
      text: 'Timing fixture',
      crop: null,
      secondary_crop: null,
      x: 0.5,
      y: 0.2,
      color: '#FFCB66',
      size: 60,
    },
    {
      id: 'punch',
      kind: 'punch_in',
      enabled: true,
      start_ms: 2000,
      end_ms: 4000,
      text: '',
      crop: { x: 0.2, y: 0.1, width: 0.55, height: 0.8 },
      secondary_crop: null,
      x: 0.5,
      y: 0.5,
      color: '#FFFFFF',
      size: 60,
    },
  ];
  clip.document.visual_layers.push({
    id: 'broll',
    kind: 'broll',
    enabled: true,
    start_ms: 4500,
    end_ms: 5500,
    text: '',
    crop: null,
    secondary_crop: null,
    x: 0.5,
    y: 0.5,
    color: '#FFFFFF',
    size: 60,
    source_start_ms: 3000,
    asset_id: (await test.api('/projects/' + imported.project_id)).project.asset_id,
  });
  clip.document.visual_layers.push({
    id: 'split',
    kind: 'split',
    enabled: true,
    start_ms: 1500,
    end_ms: 2000,
    text: '',
    crop: { x: 0.1, y: 0.1, width: 0.4, height: 0.8 },
    secondary_crop: { x: 0.5, y: 0.1, width: 0.4, height: 0.8 },
    x: 0.5,
    y: 0.5,
    color: '#FFFFFF',
    size: 60,
  });
  clip.document.audio_layers = [
    {
      id: 'tap',
      enabled: true,
      start_ms: 500,
      end_ms: 680,
      asset_id: null,
      source_start_ms: 0,
      gain: 0.12,
    },
  ];
  clip.document.audio_layers.push({
    id: 'audio',
    enabled: true,
    start_ms: 1000,
    end_ms: 3000,
    asset_id: audioAsset.asset_id,
    source_start_ms: 5000,
    gain: 0.05,
  });
  const saved = await test.api('/clips/' + clip.id, clip, 'PUT');
  const conflict = await fetch(test.origin + '/api/v1/clips/' + clip.id + '/preview-render', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revision: clip.revision }),
  });
  assert.equal(conflict.status, 409);
  evidence.conflicts = true;
  const preview = await test.wait(
    await test.api('/clips/' + clip.id + '/preview-render', {
      revision: saved.revision,
    }),
  );
  assert.ok(preview.payload.preview_asset_id);
  assert.equal(
    (await test.api('/exports')).length,
    0,
    'A preview must not create an export record.',
  );
  const rendered = await test.wait(await test.api('/clips/' + clip.id + '/export', {}));
  const id = rendered.payload.completed_exports[0].export_id;
  const output = path.join(test.directory, 'exports', id + '.mp4');
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const probe = JSON.parse(
    execFileSync(
      path.join(toolDirectory, 'ffmpeg/ffprobe' + suffix),
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output],
      { encoding: 'utf8', windowsHide: true },
    ),
  );
  assert.ok(Math.abs(Number(probe.format.duration) - 6) <= 0.1);
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  assert.equal(video.width, 720);
  assert.equal(video.height, 1280);
  assert.ok(audio);
  assert.ok(Math.abs(Number(video.start_time) - Number(audio.start_time)) <= 1 / 30);
  execFileSync(
    path.join(toolDirectory, 'ffmpeg/ffmpeg' + suffix),
    ['-v', 'error', '-i', output, '-f', 'null', '-'],
    { windowsHide: true, timeout: 60_000 },
  );
  const exported = (await test.api('/exports'))[0];
  assert.equal(exported.revision, saved.revision);
  assert.ok(
    (await readFile(path.join(test.directory, 'exports', id + '.ass'), 'utf8')).includes(
      'Timing fixture',
    ),
  );
  Object.assign(evidence, {
    multi_cut: true,
    preview: true,
    layers: true,
    duration_seconds: probe.format.duration,
    width: video.width,
    height: video.height,
    audio_import: true,
    broll: true,
  });
  const layouts = [];
  let current = saved;
  for (const layout of ['square', 'landscape', 'contain', 'blur', 'gaming']) {
    current.document.layout = layout;
    current = await test.api('/clips/' + clip.id, current, 'PUT');
    const job = await test.wait(await test.api('/clips/' + clip.id + '/export', {}));
    const output = path.join(
      test.directory,
      'exports',
      job.payload.completed_exports[0].export_id + '.mp4',
    );
    const metadata = JSON.parse(
      execFileSync(
        path.join(toolDirectory, 'ffmpeg/ffprobe' + suffix),
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output],
        { encoding: 'utf8', windowsHide: true },
      ),
    );
    const video = metadata.streams.find((stream) => stream.codec_type === 'video');
    assert.deepEqual(
      [video.width, video.height],
      layout === 'square' ? [720, 720] : layout === 'landscape' ? [1280, 720] : [720, 1280],
    );
    assert.ok(Math.abs(Number(metadata.format.duration) - 6) <= 0.1);
    execFileSync(
      path.join(toolDirectory, 'ffmpeg/ffmpeg' + suffix),
      ['-v', 'error', '-i', output, '-f', 'null', '-'],
      { windowsHide: true, timeout: 60_000 },
    );
    layouts.push(layout);
  }
  evidence.layouts = ['portrait', ...layouts];
  evidence.data_directory = test.directory;
} finally {
  await test.stop();
}
await writeFile(
  path.join(root, '.cache/editorial-validation.json'),
  JSON.stringify(evidence, null, 2),
);
process.stdout.write(JSON.stringify(evidence, null, 2) + String.fromCharCode(10));
