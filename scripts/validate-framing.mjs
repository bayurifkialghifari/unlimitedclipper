import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fixtureDirectory, toolDirectory } from './test-paths.mjs';
import { testEngine } from './test-engine.mjs';

const ffmpeg = path.join(toolDirectory, 'ffmpeg/ffmpeg.exe');
const source = path.join(fixtureDirectory, 'two-moving-faces.mp4');
await mkdir(fixtureDirectory, { recursive: true });
execFileSync(
  ffmpeg,
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-loop',
    '1',
    '-i',
    path.join(fixtureDirectory, 'astronaut.png'),
    '-i',
    path.join(fixtureDirectory, 'jfk.wav'),
    '-filter_complex',
    '[0:v]scale=360:360,split=2[a][b];[b]hflip[c];color=c=0x131820:s=1280x720:r=30:d=8[background];[background][a]overlay=x=80+40*t:y=120[first];[first][c]overlay=x=820-20*t:y=120[video]',
    '-map',
    '[video]',
    '-map',
    '1:a',
    '-t',
    '8',
    '-r',
    '30',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    source,
  ],
  { windowsHide: true, stdio: 'inherit', timeout: 60000 },
);

const engine = await testEngine(43186);
try {
  const imported = await engine.wait(await engine.api('/imports/local', { path: source }));
  let clip = await engine.api('/projects/' + imported.project_id + '/clips', {
    name: 'Controlled moving-face framing fixture',
    start_ms: 0,
    end_ms: 8000,
  });
  clip.document.version = 3;
  clip.document.segments = [
    { id: 'later-scene', start_ms: 4000, end_ms: 8000 },
    { id: 'earlier-scene', start_ms: 0, end_ms: 4000 },
  ];
  clip.document.crop.x = 0.08;
  clip.document.resolution = 720;
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const followed = await engine.wait(
    await engine.api('/clips/' + clip.id + '/track', {
      revision: clip.revision,
      mode: 'follow',
    }),
  );
  clip = await engine.api('/clips/' + clip.id);
  assert.ok(followed.payload.tracking_report.detections > 10);
  assert.ok(clip.document.keyframes.every((key) => key.time_ms >= 0 && key.time_ms < 8000));
  assert.ok(clip.document.keyframes.some((key) => key.time_ms === 3999));
  assert.ok(clip.document.keyframes.some((key) => key.time_ms === 4000));
  const split = await engine.wait(
    await engine.api('/clips/' + clip.id + '/track', {
      revision: clip.revision,
      mode: 'split',
    }),
  );
  clip = await engine.api('/clips/' + clip.id);
  assert.equal(split.payload.tracking_report.split_shots, 2);
  const layers = clip.document.visual_layers.filter((layer) => layer.id.startsWith('track-split:'));
  assert.equal(layers.length, 2);
  assert.equal(layers[0].start_ms, 0);
  assert.equal(layers[1].start_ms, 4000);
  const rendered = await engine.wait(await engine.api('/clips/' + clip.id + '/export', {}));
  const exportId = rendered.payload.completed_exports[0].export_id;
  const output = path.join(engine.directory, 'exports', exportId + '.mp4');
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
  assert.ok(Math.abs(Number(probe.format.duration) - 8) <= 0.1);
  execFileSync(ffmpeg, ['-v', 'error', '-i', output, '-f', 'null', '-'], {
    windowsHide: true,
    stdio: 'inherit',
    timeout: 60000,
  });
  const database = new DatabaseSync(path.join(engine.directory, 'studio.sqlite'));
  const interrupted = {
    ...split,
    status: 'failed',
    error: 'Controlled interruption after the framing commit.',
  };
  database
    .prepare('UPDATE jobs SET status = ?, data = ? WHERE id = ?')
    .run('failed', JSON.stringify(interrupted), split.id);
  database.close();
  await engine.wait(await engine.api('/jobs/' + split.id + '/retry', {}));
  const recovered = await engine.api('/clips/' + clip.id);
  assert.equal(recovered.revision, clip.revision);
  assert.deepEqual(recovered.document, clip.document);
  clip.document.layout = 'gaming';
  clip.document.visual_layers = [];
  clip.document.facecam_crop = { x: 0, y: 0, width: 0.6, height: 0.85 };
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const gameplay = { ...clip.document.gameplay_crop };
  const region = { ...clip.document.facecam_crop };
  await engine.wait(
    await engine.api('/clips/' + clip.id + '/track', {
      revision: clip.revision,
      mode: 'facecam',
    }),
  );
  const gaming = await engine.api('/clips/' + clip.id);
  assert.deepEqual(gaming.document.gameplay_crop, gameplay);
  assert.ok(gaming.document.facecam_crop.x >= region.x);
  assert.ok(
    gaming.document.facecam_crop.x + gaming.document.facecam_crop.width <=
      region.x + region.width + 1e-9,
  );
  const evidence = {
    fixture:
      'Controlled motion built from the existing astronaut photo and JFK audio; not a natural podcast recording.',
    directory: engine.directory,
    follow: followed.payload.tracking_report,
    split: split.payload.tracking_report,
    output: { width: video.width, height: video.height, duration: Number(probe.format.duration) },
    recovery_preserved_revision: true,
    facecam_preserved_gameplay: true,
  };
  await writeFile('.cache/economy-framing-validation.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  await engine.stop();
}
