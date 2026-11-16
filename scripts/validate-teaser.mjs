import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { testEngine } from './test-engine.mjs';
import { fixtureDirectory, toolDirectory } from './test-paths.mjs';

const engine = await testEngine(43191);
const ffmpeg = path.join(toolDirectory, 'ffmpeg/ffmpeg.exe');
const ffprobe = path.join(toolDirectory, 'ffmpeg/ffprobe.exe');

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
      'scale=64:64',
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

function distance(first, second) {
  assert.equal(first.length, second.length);
  let total = 0;
  for (let index = 0; index < first.length; index += 1) {
    total += Math.abs(first[index] - second[index]);
  }
  return total / first.length;
}

try {
  const markedFile = path.join(engine.directory, 'teaser-marked-source.mp4');
  execFileSync(
    ffmpeg,
    [
      '-y',
      '-v',
      'error',
      '-i',
      path.join(fixtureDirectory, 'speech-face.mp4'),
      '-vf',
      "drawbox=x=0:y=0:w=iw:h=ih:color=red:t=fill:enable='lt(t,2)+gte(t,3)',drawbox=x=0:y=0:w=iw:h=ih:color=green:t=fill:enable='between(t,2,3)'",
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      markedFile,
    ],
    { windowsHide: true },
  );
  const imported = await engine.wait(await engine.api('/imports/local', { path: markedFile }));
  let clip = await engine.api('/projects/' + imported.project_id + '/clips', {
    name: 'Teaser source movement fixture',
    start_ms: 0,
    end_ms: 8000,
  });
  clip.document.resolution = 720;
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const baseline = await engine.wait(await engine.api('/clips/' + clip.id + '/export', {}));
  const baselineFile = path.join(
    engine.directory,
    'exports',
    baseline.payload.completed_exports[0].export_id + '.mp4',
  );
  const moved = await engine.api('/clips/' + clip.id + '/teaser-preview', {
    document: clip.document,
    start_ms: 2000,
    end_ms: 3000,
  });
  assert.deepEqual(
    moved.segments.map(({ start_ms, end_ms }) => [start_ms, end_ms]),
    [
      [2000, 3000],
      [0, 2000],
      [3000, 8000],
    ],
  );
  clip.document = moved;
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const exported = await engine.wait(await engine.api('/clips/' + clip.id + '/export', {}));
  const movedFile = path.join(
    engine.directory,
    'exports',
    exported.payload.completed_exports[0].export_id + '.mp4',
  );
  execFileSync(ffmpeg, ['-v', 'error', '-i', movedFile, '-f', 'null', '-'], {
    windowsHide: true,
  });
  const probe = JSON.parse(
    execFileSync(ffprobe, ['-v', 'error', '-show_format', '-of', 'json', movedFile], {
      encoding: 'utf8',
      windowsHide: true,
    }),
  );
  assert.ok(Math.abs(Number(probe.format.duration) - 8) < 0.15);
  const firstMoved = frame(movedFile, 0.5);
  const firstOriginal = frame(baselineFile, 0.5);
  const teaserOriginal = frame(baselineFile, 2.5);
  const matchingDistance = distance(firstMoved, teaserOriginal);
  const originalOpeningDistance = distance(firstMoved, firstOriginal);
  assert.ok(
    matchingDistance + 1 < originalOpeningDistance,
    'The first rendered teaser frame must come from its selected later source time.',
  );
  const evidence = {
    directory: engine.directory,
    duration_ms: 8000,
    scenes: moved.segments.map(({ start_ms, end_ms }) => [start_ms, end_ms]),
    matching_frame_distance: matchingDistance,
    original_opening_distance: originalOpeningDistance,
    full_decode: true,
  };
  await writeFile('.cache/preview11-teaser-validation.json', JSON.stringify(evidence, null, 2));
  process.stdout.write(JSON.stringify(evidence) + '\n');
} finally {
  await engine.stop();
}
