import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { root } from './cargo.mjs';
import { fixtureDirectory, testDataDirectory, toolDirectory } from './test-paths.mjs';

const origin = process.env.UC_TEST_ORIGIN ?? 'http://127.0.0.1:43179';
async function api(route, body) {
  const response = await fetch(
    origin + '/api/v1' + route,
    body
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const result = await response.json();
  assert.equal(response.ok, true, JSON.stringify(result));
  return result;
}

async function wait(job) {
  let lastStage = '';
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const current = (await api('/jobs')).find((item) => item.id === job.id);
    if (current.stage !== lastStage) {
      process.stdout.write(current.kind + ': ' + current.stage + '\n');
      lastStage = current.stage;
    }
    if (current.status === 'completed') {
      return current;
    }
    assert.ok(!['failed', 'cancelled'].includes(current.status), current.error ?? current.message);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Media validation exceeded its deadline.');
}

const imported = await wait(
  await api('/imports/local', { path: path.join(fixtureDirectory, 'speech-face.mp4') }),
);
const projectId = imported.project_id;
await wait(
  await api('/projects/' + projectId + '/generate', {
    clip_count: 1,
    duration_ms: 0,
    language: 'en',
  }),
);
const detail = await api('/projects/' + projectId);
assert.ok(detail.project.words.length > 10, 'Real speech must produce timed words.');
assert.ok(
  detail.clips.length <= 1,
  'Discovery count is a maximum; zero qualifying moments is valid.',
);
const clip = await api('/projects/' + projectId + '/clips', {
  name: 'Native media fixture',
  start_ms: 1000,
  end_ms: 5000,
});
await wait(await api('/clips/' + clip.id + '/track', {}));
await wait(await api('/clips/' + clip.id + '/title', {}));
const updated = await api('/clips/' + clip.id);
assert.ok(updated.document.keyframes.length > 1, 'Tracking must write crop motion.');
assert.ok(updated.document.title.text.length > 0, 'Title inference must produce text.');
const evidence = {
  speech_words: detail.project.words.length,
  selected_clips: detail.clips.length,
  tracking_keyframes: updated.document.keyframes.length,
  title: updated.document.title.text,
  exports: [],
};
for (const layout of ['portrait', 'square', 'landscape', 'contain', 'blur', 'gaming']) {
  updated.document.layout = layout;
  updated.document.resolution = 720;
  const response = await fetch(origin + '/api/v1/clips/' + clip.id, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(updated),
  });
  const saved = await response.json();
  assert.equal(response.ok, true, JSON.stringify(saved));
  updated.revision = saved.revision;
  const rendered = await wait(await api('/clips/' + clip.id + '/export', {}));
  const exportId = rendered.payload.completed_exports[0].export_id;
  const record = (await api('/exports')).find((item) => item.id === exportId);
  const output = path.join(testDataDirectory, 'exports', exportId + '.mp4');
  const probe = JSON.parse(
    execFileSync(
      path.join(toolDirectory, 'ffmpeg/ffprobe.exe'),
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output],
      { encoding: 'utf8', windowsHide: true },
    ),
  );
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  assert.ok(Math.abs(Number(probe.format.duration) - 4) < 0.15);
  assert.equal(record.revision, saved.revision);
  evidence.exports.push({
    layout,
    width: video.width,
    height: video.height,
    duration: probe.format.duration,
  });
}
await writeFile(path.join(root, '.cache/media-validation.json'), JSON.stringify(evidence, null, 2));
process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
