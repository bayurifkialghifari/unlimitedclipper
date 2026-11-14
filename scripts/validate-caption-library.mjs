import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';
import { testEngine } from './test-engine.mjs';
import { fixtureDirectory, toolDirectory } from './test-paths.mjs';

const suffix = process.platform === 'win32' ? '.exe' : '';
const ffmpeg = path.join(toolDirectory, 'ffmpeg/ffmpeg' + suffix);
const ffprobe = path.join(toolDirectory, 'ffmpeg/ffprobe' + suffix);
const frames = path.join(root, '.cache/caption-frames');
await mkdir(frames, { recursive: true });
const engine = await testEngine(43188);
const evidence = { recipes: [], immutable: false, reveal: null };

function runMedia(tool, args, encoding) {
  return execFileSync(tool, args, {
    encoding,
    windowsHide: true,
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function subtitleTrack(id) {
  const response = await fetch(engine.origin + '/api/v1/clips/' + id + '/subtitles');
  assert.ok(response.ok);
  return response.text();
}

function isolatedCaptionFrame(track, position) {
  const relative = path.relative(root, track).replaceAll(String.fromCharCode(92), '/');
  return runMedia(ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=720x1280:r=30:d=3',
    '-vf',
    'ass=' +
      relative +
      ':fontsdir=' +
      path
        .relative(root, path.join(toolDirectory, 'fonts'))
        .replaceAll(String.fromCharCode(92), '/'),
    '-ss',
    String(position),
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ]);
}

function litPixels(frame) {
  let count = 0;
  let left = 720;
  for (let pixel = 0; pixel < frame.length / 3; pixel += 1) {
    if (Math.max(...frame.subarray(pixel * 3, pixel * 3 + 3)) > 100) {
      count += 1;
      left = Math.min(left, pixel % 720);
    }
  }
  return { count, left };
}

try {
  const imported = await engine.wait(
    await engine.api('/imports/local', {
      path: path.join(fixtureDirectory, 'speech-face.mp4'),
    }),
  );
  let clip = await engine.api('/projects/' + imported.project_id + '/clips', {
    name: 'Caption render validation',
    start_ms: 0,
    end_ms: 3000,
  });
  clip.document.resolution = 720;
  clip.document.title.text = '';
  clip.document.words = ['GO', 'GO', 'GO'].map((text, index) => ({
    id: 'caption-' + index,
    text,
    start_ms: 100 + index * 600,
    end_ms: 450 + index * 600,
    emphasis: false,
    color: null,
  }));
  const presets = await engine.api('/caption-presets');
  assert.equal(presets.length, 18);
  for (const preset of presets) {
    clip.document.captions = preset.style;
    clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
    const previewTrack = await subtitleTrack(clip.id);
    const job = await engine.wait(await engine.api('/clips/' + clip.id + '/export', {}));
    const id = job.payload.completed_exports[0].export_id;
    const output = path.join(engine.directory, 'exports', id + '.mp4');
    const track = path.join(engine.directory, 'exports', id + '.ass');
    assert.equal(await readFile(track, 'utf8'), previewTrack);
    const probe = JSON.parse(
      runMedia(
        ffprobe,
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output],
        'utf8',
      ),
    );
    assert.ok(Math.abs(Number(probe.format.duration) - 3) < 0.1);
    const video = probe.streams.find((stream) => stream.codec_type === 'video');
    assert.deepEqual([video.width, video.height], [720, 1280]);
    runMedia(ffmpeg, ['-v', 'error', '-i', output, '-f', 'null', '-']);
    runMedia(ffmpeg, [
      '-v',
      'error',
      '-y',
      '-ss',
      '0.85',
      '-i',
      output,
      '-frames:v',
      '1',
      path.join(frames, preset.id + '.png'),
    ]);
    const raster = isolatedCaptionFrame(track, 0.85);
    assert.ok(litPixels(raster).count > 200, preset.id + ' must render readable glyphs.');
    const record = (await engine.api('/exports')).find((item) => item.id === id);
    assert.equal(record.revision, clip.revision);
    evidence.recipes.push({
      id: preset.id,
      revision: clip.revision,
      duration: probe.format.duration,
      frame_sha256: createHash('sha256').update(raster).digest('hex'),
    });
    if (preset.id === 'reveal') {
      const steps = [0.25, 0.85, 1.45].map((time) => litPixels(isolatedCaptionFrame(track, time)));
      assert.ok(steps[1].count > steps[0].count * 1.5);
      assert.ok(steps[2].count > steps[1].count * 1.2);
      assert.ok(steps.every((step) => Math.abs(step.left - steps[0].left) <= 1));
      const pause = litPixels(isolatedCaptionFrame(track, 0.6));
      assert.ok(pause.count < steps[1].count);
      evidence.reveal = { steps, pause, stable_left_edge: true };
    }
    if (preset.id === 'underline') {
      assert.ok(previewTrack.includes(String.fromCharCode(92) + 'u1'));
      assert.ok(previewTrack.includes(String.fromCharCode(92) + 'u0'));
    }
    process.stdout.write('Rendered ' + preset.id + '\n');
  }
  const revisions = (await engine.api('/exports')).map((item) => item.revision);
  clip.document.words[0].text = 'Later edit';
  await engine.api('/clips/' + clip.id, clip, 'PUT');
  assert.deepEqual(
    (await engine.api('/exports')).map((item) => item.revision),
    revisions,
  );
  evidence.immutable = true;
  evidence.data_directory = engine.directory;
  await writeFile(
    path.join(root, '.cache/caption-media-validation.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
} finally {
  await engine.stop();
}
