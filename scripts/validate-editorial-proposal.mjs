import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';
import { testEngine } from './test-engine.mjs';

const fixture = path.resolve(process.env.UC_EDITORIAL_FIXTURE_DIR ?? '.cache/caption-quality-data');
const database = new DatabaseSync(path.join(fixture, 'studio.sqlite'), { readOnly: true });
const record = database
  .prepare('SELECT data FROM projects WHERE id = ?')
  .get(process.env.UC_EDITORIAL_PROJECT_ID ?? 'cc325a23-2bdb-4750-b074-a36889ddfeb5');
assert.ok(record, 'The real Indonesian transcription fixture is required.');
const project = JSON.parse(record.data);
const source = database
  .prepare('SELECT relative_path FROM assets WHERE id = ?')
  .get(project.asset_id);
database.close();
const engine = await testEngine(43190);
try {
  const imported = await engine.wait(
    await engine.api('/imports/local', { path: path.join(fixture, source.relative_path) }),
  );
  const clip = await engine.api('/projects/' + imported.project_id + '/clips', {
    name: 'Real Indonesian editorial proposal',
    start_ms: 0,
    end_ms: project.duration_ms,
  });
  clip.document.words = project.words;
  const saved = await engine.api('/clips/' + clip.id, clip, 'PUT');
  const job = await engine.wait(
    await engine.api('/clips/' + clip.id + '/auto-edit', {
      revision: saved.revision,
      profile: 'editorial',
      remove_silence: false,
    }),
  );
  const proposal = job.payload.proposed_document;
  assert.ok(proposal);
  assert.equal(proposal.captions.preset, 'kinetic');
  assert.equal((await engine.api('/clips/' + clip.id)).revision, saved.revision);
  const ids = new Set(project.words.map((word) => word.id));
  assert.ok(proposal.words.every((word) => ids.has(word.id)));
  const applied = await engine.api('/clips/' + clip.id, { ...saved, document: proposal }, 'PUT');
  assert.equal(applied.revision, saved.revision + 1);
  const evidence = {
    data_directory: engine.directory,
    source_duration_ms: project.duration_ms,
    words: proposal.words.length,
    visual_layers: proposal.visual_layers.length,
    grounded_word_ids: true,
    immutable_proposal: true,
    revision_apply: true,
    native_quality_pack: 'not installed; silence removal disabled',
  };
  await writeFile(
    path.join(root, '.cache/editorial-proposal-validation.json'),
    JSON.stringify(evidence, null, 2),
  );
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
} finally {
  await engine.stop();
}
