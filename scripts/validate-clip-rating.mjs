import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';
import { fixtureDirectory } from './test-paths.mjs';
import { testEngine } from './test-engine.mjs';

const engine = await testEngine(43189);
const started = Date.now();
try {
  assert.ok((await engine.api('/models')).some((model) => model.id === 'qwen3-4b' && model.ready));
  const imported = await engine.wait(
    await engine.api('/imports/local', {
      path: path.join(fixtureDirectory, 'speech-face.mp4'),
    }),
  );
  let clip = await engine.api('/projects/' + imported.project_id + '/clips', {
    name: 'A complete public speech excerpt',
    start_ms: 0,
    end_ms: 12000,
  });
  await engine.wait(
    await engine.api('/clips/' + clip.id + '/captions', {
      revision: clip.revision,
      speech_model: 'whisper-small',
      language: 'en',
      vocabulary: '',
    }),
  );
  clip = await engine.api('/clips/' + clip.id);
  const frozen = structuredClone(clip);
  const queued = await engine.api('/clips/' + clip.id + '/rating', { revision: clip.revision });
  const completed = await engine.wait(queued);
  const rating = await engine.api('/clips/' + clip.id + '/rating');
  assert.deepEqual(rating, completed.payload.rating);
  assert.equal(rating.revision, frozen.revision);
  assert.equal(
    rating.score,
    rating.dimensions.reduce((sum, item) => sum + item.score, 0),
  );
  assert.deepEqual(
    new Set(rating.dimensions.map((item) => item.key)),
    new Set(['hook', 'clarity', 'flow', 'payoff']),
  );
  assert.deepEqual(await engine.api('/clips/' + clip.id), frozen);
  clip.document.words[0].text = 'Manual correction';
  clip = await engine.api('/clips/' + clip.id, clip, 'PUT');
  assert.notEqual(clip.revision, rating.revision);
  assert.deepEqual(await engine.api('/clips/' + clip.id + '/rating'), rating);
  const conflict = await fetch(engine.origin + '/api/v1/clips/' + clip.id + '/rating', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revision: frozen.revision }),
  });
  assert.equal(conflict.status, 409);
  const evidence = {
    model: rating.model,
    rating,
    transcript: frozen.document.words.map((word) => word.text).join(' '),
    elapsed_ms: Date.now() - started,
    edit_unchanged: true,
    stale_revision: true,
    conflict_rejected: true,
    data_directory: engine.directory,
  };
  await writeFile(
    path.join(root, '.cache/clip-rating-validation.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
} finally {
  await engine.stop();
}
