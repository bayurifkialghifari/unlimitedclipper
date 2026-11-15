import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { link, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';

const modelsRoot = path.join(root, '.cache/narration-validation-models');
process.env.UC_MODELS_DIR = modelsRoot;
const { testEngine } = await import('./test-engine.mjs');
const { fixtureDirectory, toolDirectory } = await import('./test-paths.mjs');
const manifest = JSON.parse(
  await readFile(path.join(root, 'resources/narration-pack.json'), 'utf8'),
);
const cachedPack = path.join(root, '.cache/supertonic3');
const installedPack = path.join(modelsRoot, 'supertonic-3');

for (const file of manifest.files) {
  const source = path.join(cachedPack, file.path);
  const destination = path.join(installedPack, file.path);
  assert.equal((await stat(source)).size, file.size, 'The pinned narration file is missing.');
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await link(source, destination);
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

const ffmpeg = path.join(toolDirectory, 'ffmpeg/ffmpeg.exe');
const ffprobe = path.join(toolDirectory, 'ffmpeg/ffprobe.exe');
let engine = await testEngine(43210, { writableModels: true });
const evidence = { directory: engine.directory, model_revision: manifest.revision };

function magnitude(file, start, duration) {
  const bytes = execFileSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-ss',
      String(start),
      '-i',
      file,
      '-t',
      String(duration),
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      's16le',
      'pipe:1',
    ],
    { windowsHide: true, timeout: 60000 },
  );
  let sum = 0;
  for (let index = 0; index < bytes.length; index += 2) {
    sum += Math.abs(bytes.readInt16LE(index));
  }
  return sum / (bytes.length / 2);
}

async function terminal(jobId) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const job = (await engine.api('/jobs')).find((item) => item.id === jobId);
    if (job && ['cancelled', 'failed', 'completed'].includes(job.status)) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Narration cancellation did not stop.');
}

try {
  const packJob = await engine.api('/models/narration-pack', {}, 'POST');
  await engine.wait(packJob);
  const pack = await engine.api('/models/narration-pack');
  assert.equal(pack.ready, true);
  assert.equal(pack.downloaded_bytes, pack.size_bytes);

  const imported = await engine.wait(
    await engine.api('/imports/local', {
      path: path.join(fixtureDirectory, 'speech-face.mp4'),
    }),
  );
  let clip = await engine.api('/projects/' + imported.project_id + '/clips', {
    name: 'Narrated cards',
    start_ms: 0,
    end_ms: 3000,
  });
  clip.document = await engine.api('/clips/' + clip.id + '/timeline-preview', {
    document: clip.document,
    segments: [{ id: 'main', start_ms: 0, end_ms: 3000 }],
  });
  clip.document.version = 4;
  clip.document.resolution = 720;
  const card = {
    duration_ms: 3000,
    font: 'Oswald',
    size: 90,
    color: '#FFFFFF',
    background: '#151B24',
    position_y: 0.5,
    animation: 'none',
  };
  clip.document.intro_card = { ...card, text: 'Halo dunia.' };
  clip.document.outro_card = { ...card, text: 'Welcome back.' };
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const frozenRevision = clip.revision;

  const introJob = await engine.wait(
    await engine.api('/clips/' + clip.id + '/cards/intro/narration', {
      revision: frozenRevision,
      language: 'id',
    }),
  );
  const outroJob = await engine.wait(
    await engine.api('/clips/' + clip.id + '/cards/outro/narration', {
      revision: frozenRevision,
      language: 'en',
    }),
  );
  const intro = introJob.payload.card_narration;
  const outro = outroJob.payload.card_narration;
  assert.equal(intro.text, clip.document.intro_card.text);
  assert.equal(outro.text, clip.document.outro_card.text);
  assert.equal((await engine.api('/clips/' + clip.id)).revision, frozenRevision);
  const stale = await fetch(engine.origin + '/api/v1/clips/' + clip.id + '/cards/intro/narration', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revision: frozenRevision - 1, language: 'id' }),
  });
  assert.equal(stale.status, 409);

  clip.document.intro_card.narration = intro;
  clip.document.outro_card.narration = outro;
  clip.document.intro_card.duration_ms = Math.max(3000, intro.duration_ms + 250);
  clip.document.outro_card.duration_ms = Math.max(3000, outro.duration_ms + 250);
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const previewJob = await engine.wait(
    await engine.api('/clips/' + clip.id + '/preview-render', { revision: clip.revision }),
  );
  const previewFile = path.join(engine.directory, 'narration-preview.mp4');
  await writeFile(
    previewFile,
    Buffer.from(
      await (
        await fetch(engine.origin + '/api/v1/assets/' + previewJob.payload.preview_asset_id)
      ).arrayBuffer(),
    ),
  );
  const exportJob = await engine.wait(await engine.api('/clips/' + clip.id + '/export', {}));
  const exportId = exportJob.payload.completed_exports[0].export_id;
  const exportFile = path.join(engine.directory, 'exports', exportId + '.mp4');
  const finalDuration =
    (clip.document.intro_card.duration_ms + 3000 + clip.document.outro_card.duration_ms) / 1000;
  for (const file of [previewFile, exportFile]) {
    execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], {
      windowsHide: true,
      timeout: 120_000,
    });
    const metadata = JSON.parse(
      execFileSync(ffprobe, ['-v', 'error', '-show_format', '-of', 'json', file], {
        windowsHide: true,
      }).toString(),
    );
    assert.ok(Math.abs(Number(metadata.format.duration) - finalDuration) < 0.11);
    assert.ok(magnitude(file, 0.3, 0.7) > 20, 'Opening narration must be audible.');
    assert.ok(
      magnitude(file, clip.document.intro_card.duration_ms / 1000 + 0.5, 0.7) > 20,
      'Source audio must remain audible.',
    );
    assert.ok(
      magnitude(file, (clip.document.intro_card.duration_ms + 3000) / 1000 + 0.3, 0.7) > 20,
      'Closing narration must be audible.',
    );
  }

  const directory = engine.directory;
  await engine.stop();
  engine = await testEngine(43210, { writableModels: true, existingDirectory: directory });
  const restored = await engine.api('/clips/' + clip.id);
  assert.equal(restored.document.intro_card.narration.asset_id, intro.asset_id);
  assert.equal(restored.document.outro_card.narration.asset_id, outro.asset_id);
  assert.equal((await engine.api('/clips/' + clip.id + '/cards/intro/narration')).id, introJob.id);

  restored.document.intro_card.text = 'Mari kita mulai cerita baru.';
  restored.document.intro_card.narration = null;
  clip = await engine.api('/clips/' + clip.id, restored, 'PUT');
  const cancellationJob = await engine.api('/clips/' + clip.id + '/cards/intro/narration', {
    revision: clip.revision,
    language: 'id',
  });
  await engine.api('/jobs/' + cancellationJob.id + '/cancel', {}, 'POST');
  const cancelled = await terminal(cancellationJob.id);
  assert.equal(cancelled.status, 'cancelled');
  const retried = await engine.wait(
    await engine.api('/jobs/' + cancellationJob.id + '/retry', {}, 'POST'),
  );
  assert.equal(retried.payload.card_narration.text, clip.document.intro_card.text);

  Object.assign(evidence, {
    pack_verified: true,
    languages: ['id', 'en'],
    revision_conflict: true,
    preview_and_export_full_decode: true,
    preview_and_export_audio: true,
    final_duration_ms: finalDuration * 1000,
    restart_persistence: true,
    cancellation_and_retry: true,
    narration_durations_ms: [intro.duration_ms, outro.duration_ms],
  });
  await writeFile(
    path.join(root, '.cache/narration-validation.json'),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
} finally {
  await engine.stop();
}
