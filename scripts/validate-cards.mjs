import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { testEngine } from './test-engine.mjs';
import { fixtureDirectory, toolDirectory } from './test-paths.mjs';

let engine = await testEngine(43196);
const ffmpeg = path.join(toolDirectory, 'ffmpeg/ffmpeg.exe');
const ffprobe = path.join(toolDirectory, 'ffmpeg/ffprobe.exe');
const evidence = { directory: engine.directory };

function pixels(file, seconds) {
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
      'scale=16:16',
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

function samples(file, seconds) {
  return execFileSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-ss',
      String(seconds),
      '-i',
      file,
      '-t',
      '0.2',
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

function meanMagnitude(bytes) {
  let sum = 0;
  for (let index = 0; index < bytes.length; index += 2) {
    sum += Math.abs(bytes.readInt16LE(index));
  }
  return sum / (bytes.length / 2);
}

try {
  const imported = await engine.wait(
    await engine.api('/imports/local', {
      path: path.join(fixtureDirectory, 'speech-face.mp4'),
    }),
  );
  let clip = await engine.api('/projects/' + imported.project_id + '/clips', {
    name: 'Independent card timing fixture',
    start_ms: 0,
    end_ms: 6000,
  });
  clip.document.resolution = 720;
  clip.document = await engine.api('/clips/' + clip.id + '/timeline-preview', {
    document: clip.document,
    segments: [
      { id: 'later', start_ms: 5000, end_ms: 6000 },
      { id: 'first', start_ms: 0, end_ms: 1000 },
    ],
  });
  clip.document.version = 4;
  const card = {
    text: 'Timing fixture',
    duration_ms: 1000,
    font: 'Oswald',
    size: 90,
    color: '#FFFFFF',
    background: '#D02020',
    position_y: 0.5,
    animation: 'none',
  };
  clip.document.intro_card = card;
  clip.document.outro_card = { ...card, duration_ms: 1500, background: '#2030D0' };
  clip.document.words = [
    {
      id: 'timing-word',
      text: 'Timed caption',
      start_ms: 200,
      end_ms: 600,
      emphasis: false,
      color: null,
      timing: {
        provenance: 'manual',
        source_start_ms: 5200,
        source_end_ms: 5600,
        alignment_confidence: null,
      },
    },
  ];
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const revision = clip.revision;
  const preview = await engine.wait(
    await engine.api('/clips/' + clip.id + '/preview-render', { revision }),
  );
  const previewFile = path.join(engine.directory, 'cards-preview.mp4');
  await writeFile(
    previewFile,
    Buffer.from(
      await (
        await fetch(engine.origin + '/api/v1/assets/' + preview.payload.preview_asset_id)
      ).arrayBuffer(),
    ),
  );
  const queued = await engine.api('/clips/' + clip.id + '/export', {});
  clip.document.intro_card.duration_ms = 2000;
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const exported = await engine.wait(queued);
  const exportId = exported.payload.completed_exports[0].export_id;
  const exportFile = path.join(engine.directory, 'exports', exportId + '.mp4');
  for (const file of [previewFile, exportFile]) {
    const metadata = JSON.parse(
      execFileSync(ffprobe, ['-v', 'error', '-show_format', '-of', 'json', file], {
        windowsHide: true,
      }).toString(),
    );
    assert.ok(Math.abs(Number(metadata.format.duration) - 4.5) < 0.1);
    execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], {
      windowsHide: true,
      timeout: 60000,
    });
    const opening = pixels(file, 0.25);
    const closing = pixels(file, 3.5);
    assert.ok(opening[0] > opening[2] + 100, 'Opening card must be red.');
    assert.ok(closing[2] > closing[0] + 100, 'Closing card must be blue.');
    assert.ok(meanMagnitude(samples(file, 0.25)) < 3, 'Opening card is silent.');
    assert.ok(meanMagnitude(samples(file, 3.5)) < 3, 'Closing card is silent.');
    assert.ok(
      meanMagnitude(samples(file, 1.25)) > 10,
      'Content audio starts after the opening card.',
    );
    const content = pixels(file, 1.75);
    assert.ok(
      content.some((byte, index) => Math.abs(byte - opening[index]) > 40),
      'The source footage must play between cards.',
    );
  }
  const srt = await readFile(path.join(engine.directory, 'exports', exportId + '.srt'), 'utf8');
  assert.ok(srt.includes('00:00:01,200 --> 00:00:01,600'));
  assert.equal(
    (await engine.api('/exports')).find((item) => item.id === exportId).revision,
    revision,
  );
  const directory = engine.directory;
  await engine.stop();
  engine = await testEngine(43196, { existingDirectory: directory });
  const reopened = await engine.api('/projects/' + imported.project_id);
  const restored = reopened.clips.find((item) => item.id === clip.id);
  assert.equal(restored.document.intro_card.duration_ms, 2000);
  assert.equal(restored.document.words[0].timing.source_start_ms, 5200);
  Object.assign(evidence, {
    full_decode: true,
    independent_card_audio: true,
    preview_export_duration_ms: 4500,
    caption_offset_once: true,
    immutable_revision: revision,
    later_revision: clip.revision,
    restart_persistence: true,
  });
  await writeFile('.cache/card-media-validation.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  await engine.stop();
}
