import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';
import { toolDirectory } from './test-paths.mjs';
import { testEngine } from './test-engine.mjs';

const suffix = process.platform === 'win32' ? '.exe' : '';
const ffmpeg = path.join(toolDirectory, 'ffmpeg/ffmpeg' + suffix);
const ffprobe = path.join(toolDirectory, 'ffmpeg/ffprobe' + suffix);
const fixture = path.join(root, '.cache/fixtures/scene-order.mp4');
await mkdir(path.dirname(fixture), { recursive: true });
const inputs = [];
for (const [color, frequency] of [
  ['red', 440],
  ['green', 660],
  ['blue', 880],
]) {
  inputs.push('-f', 'lavfi', '-i', 'color=c=' + color + ':s=640x360:r=30:d=1');
  inputs.push('-f', 'lavfi', '-i', 'sine=frequency=' + frequency + ':sample_rate=48000:duration=1');
}
execFileSync(
  ffmpeg,
  [
    '-v',
    'error',
    '-y',
    ...inputs,
    '-filter_complex',
    '[0:v][1:a][2:v][3:a][4:v][5:a]concat=n=3:v=1:a=1[v][a]',
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    fixture,
  ],
  { windowsHide: true, timeout: 60000 },
);

function mediaEvidence(filename) {
  const probe = JSON.parse(
    execFileSync(
      ffprobe,
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filename],
      { encoding: 'utf8', windowsHide: true },
    ),
  );
  assert.ok(Math.abs(Number(probe.format.duration) - 3) < 0.1);
  const colors = [];
  const frequencies = [];
  for (const [position, channel, expectedFrequency] of [
    [0.3, 2, 880],
    [1.3, 0, 440],
    [2.3, 1, 660],
  ]) {
    const pixel = execFileSync(
      ffmpeg,
      [
        '-v',
        'error',
        '-ss',
        String(position),
        '-i',
        filename,
        '-frames:v',
        '1',
        '-vf',
        'crop=2:2:iw/2:ih/2,scale=1:1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ],
      { windowsHide: true },
    );
    assert.equal(pixel.length, 3);
    assert.ok(pixel[channel] > 90);
    assert.ok([...pixel].every((value, index) => index === channel || value < 50));
    colors.push([...pixel]);
    const pcm = execFileSync(
      ffmpeg,
      [
        '-v',
        'error',
        '-ss',
        String(position),
        '-i',
        filename,
        '-t',
        '0.2',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '48000',
        '-f',
        's16le',
        'pipe:1',
      ],
      { windowsHide: true },
    );
    let crossings = 0;
    for (let offset = 2; offset < pcm.length; offset += 2) {
      if (pcm.readInt16LE(offset - 2) <= 0 && pcm.readInt16LE(offset) > 0) {
        crossings += 1;
      }
    }
    const frequency = (crossings * 48000) / (pcm.length / 2);
    assert.ok(Math.abs(frequency - expectedFrequency) <= 12);
    frequencies.push(frequency);
  }
  execFileSync(ffmpeg, ['-v', 'error', '-i', filename, '-f', 'null', '-'], {
    windowsHide: true,
    timeout: 60000,
  });
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  assert.ok(audio);
  assert.ok(Math.abs(Number(video.start_time) - Number(audio.start_time)) < 1 / 30);
  return {
    duration: probe.format.duration,
    width: video.width,
    height: video.height,
    colors,
    frequencies,
  };
}

const test = await testEngine(43186);
const evidence = { source_version: 3, layouts: [], preview: null, immutable: false };
try {
  const health = await test.api('/health');
  assert.ok(health.edit_document_versions.includes(3));
  const imported = await test.wait(await test.api('/imports/local', { path: fixture }));
  let clip = await test.api('/projects/' + imported.project_id + '/clips', {
    name: 'Scene order fixture',
    start_ms: 0,
    end_ms: 3000,
  });
  clip.document.resolution = 720;
  clip.document.words = ['RED', 'GREEN', 'BLUE'].map((text, index) => ({
    id: 'word-' + index,
    text,
    start_ms: index * 1000 + 120,
    end_ms: index * 1000 + 600,
    emphasis: false,
    color: null,
  }));
  const reordered = await test.api('/clips/' + clip.id + '/timeline-preview', {
    document: clip.document,
    segments: [
      { id: 'blue', start_ms: 2000, end_ms: 3000 },
      { id: 'red', start_ms: 0, end_ms: 1000 },
      { id: 'green', start_ms: 1000, end_ms: 2000 },
    ],
  });
  assert.deepEqual(
    reordered.words.map((word) => word.text),
    ['BLUE', 'RED', 'GREEN'],
  );
  clip.document = reordered;
  clip = await test.api('/clips/' + clip.id, clip, 'PUT');
  const preview = await test.wait(
    await test.api('/clips/' + clip.id + '/preview-render', { revision: clip.revision }),
  );
  const previewAsset = await fetch(
    test.origin + '/api/v1/assets/' + preview.payload.preview_asset_id,
  );
  assert.ok(previewAsset.ok);
  const previewFile = path.join(test.directory, 'preview-check.mp4');
  await writeFile(previewFile, Buffer.from(await previewAsset.arrayBuffer()));
  evidence.preview = mediaEvidence(previewFile);
  assert.equal((await test.api('/exports')).length, 0);
  for (const layout of ['portrait', 'square', 'landscape', 'contain', 'blur', 'gaming']) {
    clip.document.layout = layout;
    clip = await test.api('/clips/' + clip.id, clip, 'PUT');
    const rendered = await test.wait(await test.api('/clips/' + clip.id + '/export', {}));
    const id = rendered.payload.completed_exports[0].export_id;
    const result = mediaEvidence(path.join(test.directory, 'exports', id + '.mp4'));
    const subtitles = await readFile(path.join(test.directory, 'exports', id + '.srt'), 'utf8');
    assert.ok(subtitles.indexOf('BLUE') < subtitles.indexOf('RED'));
    assert.ok(subtitles.indexOf('RED') < subtitles.indexOf('GREEN'));
    assert.ok(subtitles.includes('00:00:00,120'));
    assert.equal(
      (await test.api('/exports')).find((item) => item.id === id).revision,
      clip.revision,
    );
    evidence.layouts.push({ layout, revision: clip.revision, ...result });
  }
  const revisions = (await test.api('/exports')).map((item) => item.revision);
  clip.document.words[0].text = 'Later edit';
  clip = await test.api('/clips/' + clip.id, clip, 'PUT');
  assert.deepEqual(
    (await test.api('/exports')).map((item) => item.revision),
    revisions,
  );
  evidence.immutable = true;
  await writeFile(
    path.join(root, '.cache/scene-media-validation.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await test.stop();
}
