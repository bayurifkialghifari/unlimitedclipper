import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fixtureDirectory, toolDirectory } from './test-paths.mjs';
import { testEngine } from './test-engine.mjs';

const engine = await testEngine(43186);
try {
  const imported = await engine.wait(
    await engine.api('/imports/local', {
      path: path.join(fixtureDirectory, 'two-moving-faces.mp4'),
    }),
  );
  let clip = await engine.api('/projects/' + imported.project_id + '/clips', {
    name: 'Dense crop interpolation regression',
    start_ms: 0,
    end_ms: 8000,
  });
  clip.document.resolution = 720;
  clip.document.crop = { x: 0.1, y: 0.02, width: 0.25, height: 0.75 };
  clip.document.keyframes = Array.from({ length: 300 }, (_, index) => ({
    time_ms: index * 26,
    x: 0.1 + (Math.sin(index / 10) + 1) * 0.2,
    y: 0.02 + (Math.cos(index / 10) + 1) * 0.08,
  }));
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const rendered = await engine.wait(await engine.api('/clips/' + clip.id + '/export', {}));
  const exportId = rendered.payload.completed_exports[0].export_id;
  const exported = path.join(engine.directory, 'exports', exportId + '.mp4');
  const previewed = await engine.wait(
    await engine.api('/clips/' + clip.id + '/preview-render', { revision: clip.revision }),
  );
  const database = new DatabaseSync(path.join(engine.directory, 'studio.sqlite'), {
    readOnly: true,
  });
  const preview = database
    .prepare('SELECT relative_path FROM assets WHERE id = ?')
    .get(previewed.payload.preview_asset_id);
  database.close();
  assert.ok(preview, 'Edited preview must use a registered managed asset.');
  const files = [exported, path.join(engine.directory, preview.relative_path)];
  for (const file of files) {
    const probe = JSON.parse(
      execFileSync(
        path.join(toolDirectory, 'ffmpeg/ffprobe.exe'),
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
        { encoding: 'utf8', windowsHide: true },
      ),
    );
    const video = probe.streams.find((stream) => stream.codec_type === 'video');
    assert.equal(video.width, 720);
    assert.equal(video.height, 1280);
    assert.ok(Math.abs(Number(probe.format.duration) - 8) <= 0.1);
    execFileSync(
      path.join(toolDirectory, 'ffmpeg/ffmpeg.exe'),
      ['-v', 'error', '-i', file, '-f', 'null', '-'],
      { windowsHide: true, stdio: 'inherit', timeout: 60000 },
    );
  }
  const graph = await readFile(
    path.join(engine.directory, 'temporary', rendered.id + '-' + clip.id + '-filter.txt'),
  );
  assert.ok(graph.length > 32768, 'The graph must exceed the Windows command-line limit.');
  const saved = await engine.api('/clips/' + clip.id);
  assert.deepEqual(saved.document.keyframes, clip.document.keyframes);
  assert.equal(saved.revision, clip.revision);
  const evidence = {
    directory: engine.directory,
    anchors: clip.document.keyframes.length,
    filter_graph_bytes: graph.length,
    preview_and_export_full_decode: true,
    immutable_revision: clip.revision,
    width: 720,
    height: 1280,
    duration_ms: 8000,
  };
  await writeFile(
    '.cache/economy-motion-render-validation.json',
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
} finally {
  await engine.stop();
}
