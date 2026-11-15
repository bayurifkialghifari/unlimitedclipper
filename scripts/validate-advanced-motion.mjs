import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { testEngine } from './test-engine.mjs';
import { fixtureDirectory, toolDirectory } from './test-paths.mjs';

const engine = await testEngine(43196);
const ffmpeg = path.join(toolDirectory, 'ffmpeg/ffmpeg.exe');
const fixture = path.join(fixtureDirectory, 'two-moving-faces.mp4');
const evidence = { directory: engine.directory };

function picture(file, seconds, filter = 'scale=72:128') {
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
      filter,
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

function difference(first, second) {
  assert.equal(first.length, second.length);
  let total = 0;
  for (let index = 0; index < first.length; index += 1) {
    total += Math.abs(first[index] - second[index]);
  }
  return total / first.length;
}

try {
  const imported = await engine.wait(await engine.api('/imports/local', { path: fixture }));
  let clip = await engine.api('/projects/' + imported.project_id + '/clips', {
    name: 'Camera easing geometry fixture',
    start_ms: 0,
    end_ms: 6000,
  });
  clip.document = await engine.api('/clips/' + clip.id + '/timeline-preview', {
    document: clip.document,
    segments: [{ id: 'all', start_ms: 0, end_ms: 6000 }],
  });
  clip.document.version = 4;
  clip.document.resolution = 720;
  clip.document.captions.enabled = false;
  clip.document.camera_motion = [
    { time_ms: 0, x: 0.2, y: 0.5, zoom: 1, easing: { kind: 'linear' } },
    { time_ms: 6000, x: 0.8, y: 0.5, zoom: 2, easing: { kind: 'smooth' } },
  ];
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const plan = await engine.api('/clips/' + clip.id + '/preview-plan', {
    revision: clip.revision,
    document: clip.document,
  });
  const project = (await engine.api('/projects/' + imported.project_id)).project;
  const exported = await engine.wait(await engine.api('/clips/' + clip.id + '/export', {}));
  const exportId = exported.payload.completed_exports[0].export_id;
  const file = path.join(engine.directory, 'exports', exportId + '.mp4');
  execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], {
    windowsHide: true,
    timeout: 60000,
  });
  const measurements = [];
  for (const seconds of [0.5, 2, 4.5]) {
    const progress = seconds / 6;
    const eased = progress * progress * (3 - 2 * progress);
    const zoom = 1 + eased;
    const width = plan.camera_motion.base_width / zoom;
    const height = plan.camera_motion.base_height / zoom;
    const x = Math.max(0, Math.min(1 - width, 0.2 + 0.6 * eased - width / 2));
    const y = Math.max(0, Math.min(1 - height, 0.5 - height / 2));
    const expected = picture(
      fixture,
      seconds,
      'crop=' +
        Math.floor((width * project.width) / 2) * 2 +
        ':' +
        Math.floor((height * project.height) / 2) * 2 +
        ':' +
        Math.round(x * project.width) +
        ':' +
        Math.round(y * project.height) +
        ',scale=72:128',
    );
    const actual = picture(file, seconds);
    const error = difference(actual, expected);
    assert.ok(
      error < 24,
      'Export framing must match independently sampled source geometry: ' + error,
    );
    measurements.push({ seconds, pixel_mean_error: error });
  }
  clip.document.visual_layers.push({
    id: 'moving-note',
    kind: 'note',
    enabled: true,
    start_ms: 0,
    end_ms: 6000,
    text: 'MOVE',
    x: 0.2,
    y: 0.3,
    color: '#FFCB66',
    size: 90,
    crop: null,
    secondary_crop: null,
    asset_id: null,
    source_start_ms: 0,
    motion: [
      { time_ms: 0, x: 0.2, y: 0.3, scale: 1, opacity: 1, easing: { kind: 'linear' } },
      { time_ms: 6000, x: 0.8, y: 0.7, scale: 1.5, opacity: 1, easing: { kind: 'smooth' } },
    ],
  });
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const moved = await engine.wait(await engine.api('/clips/' + clip.id + '/export', {}));
  const movedFile = path.join(
    engine.directory,
    'exports',
    moved.payload.completed_exports[0].export_id + '.mp4',
  );
  const textErrors = [1, 5].map((seconds) =>
    difference(picture(file, seconds), picture(movedFile, seconds)),
  );
  assert.ok(
    textErrors.every((error) => error > 1),
    'Animated text must render in the MP4.',
  );
  clip.document.visual_layers.push({
    id: 'moving-broll',
    kind: 'broll',
    enabled: true,
    start_ms: 0,
    end_ms: 6000,
    text: '',
    x: 0.5,
    y: 0.5,
    color: '#FFCB66',
    size: 60,
    crop: null,
    secondary_crop: null,
    asset_id: project.asset_id,
    source_start_ms: 0,
    motion: [
      { time_ms: 0, x: 0.4, y: 0.5, scale: 1, opacity: 1, easing: { kind: 'linear' } },
      { time_ms: 6000, x: 0.7, y: 0.5, scale: 2, opacity: 1, easing: { kind: 'smooth' } },
    ],
  });
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const opaqueJob = await engine.wait(await engine.api('/clips/' + clip.id + '/export', {}));
  const opaqueFile = path.join(
    engine.directory,
    'exports',
    opaqueJob.payload.completed_exports[0].export_id + '.mp4',
  );
  execFileSync(ffmpeg, ['-v', 'error', '-i', opaqueFile, '-f', 'null', '-'], {
    windowsHide: true,
    timeout: 60000,
  });
  const opaqueDifference = difference(picture(movedFile, 4), picture(opaqueFile, 4));
  assert.ok(opaqueDifference > 2, 'B-roll zoom must change the decoded MP4.');
  clip.document.visual_layers.at(-1).motion[1].opacity = 0.4;
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const alphaJob = await engine.wait(await engine.api('/clips/' + clip.id + '/export', {}));
  const alphaFile = path.join(
    engine.directory,
    'exports',
    alphaJob.payload.completed_exports[0].export_id + '.mp4',
  );
  execFileSync(ffmpeg, ['-v', 'error', '-i', alphaFile, '-f', 'null', '-'], {
    windowsHide: true,
    timeout: 60000,
  });
  const alphaDifference = difference(picture(opaqueFile, 4), picture(alphaFile, 4));
  assert.ok(alphaDifference > 1, 'B-roll opacity easing must change the decoded MP4.');
  Object.assign(evidence, {
    camera_full_decode: true,
    curve_geometry: measurements,
    animated_text_pixel_error: textErrors,
    broll_zoom_pixel_error: opaqueDifference,
    broll_opacity_pixel_error: alphaDifference,
    revision: clip.revision,
  });
  await writeFile('.cache/advanced-motion-validation.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  await engine.stop();
}
