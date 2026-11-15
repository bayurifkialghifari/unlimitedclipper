import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './cargo.mjs';
import { fixtureDirectory } from './test-paths.mjs';
import { testEngine } from './test-engine.mjs';

function words(text) {
  return text
    .split(/\s+/)
    .map((word) => word.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
}

function containsQuote(transcript, quote) {
  const source = words(transcript);
  const phrase = words(quote);
  return source.some((_, index) => phrase.every((word, offset) => source[index + offset] === word));
}

async function runBrowser(origin, clipId) {
  const child = spawn(
    process.execPath,
    [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', 'hook-proposals.spec.ts'],
    {
      cwd: root,
      windowsHide: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        UC_TEST_ORIGIN: origin,
        UC_TEST_HOOK_CLIP_ID: clipId,
      },
    },
  );
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  assert.equal(exitCode, 0, 'Hook proposal browser interactions must pass.');
}

const port = 43197;
let engine = await testEngine(port);
const directory = engine.directory;
const started = Date.now();
try {
  const models = await engine.api('/models');
  assert.ok(models.some((model) => model.id === 'qwen3-4b' && model.ready));
  assert.ok(models.some((model) => model.id === 'whisper-small' && model.ready));
  const imported = await engine.wait(
    await engine.api('/imports/local', {
      path: path.join(fixtureDirectory, 'speech-face.mp4'),
    }),
  );
  let clip = await engine.api('/projects/' + imported.project_id + '/clips', {
    name: 'Hook proposal media fixture',
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
  const transcript = clip.document.words.map((word) => word.text).join(' ');
  assert.ok(transcript.length > 30);
  const job = await engine.wait(
    await engine.api('/clips/' + clip.id + '/hook-proposals', {
      revision: clip.revision,
    }),
  );
  const set = await engine.api('/clips/' + clip.id + '/hook-proposals');
  assert.equal(set.id, job.id);
  assert.equal(set.revision, clip.revision);
  assert.ok(set.proposals.length >= 1 && set.proposals.length <= 8);
  assert.equal(
    new Set(set.proposals.map((proposal) => proposal.text.toLowerCase())).size,
    set.proposals.length,
  );
  for (const proposal of set.proposals) {
    assert.ok(containsQuote(transcript, proposal.source_quote));
    assert.ok(proposal.explanation.trim());
  }
  assert.deepEqual(await engine.api('/clips/' + clip.id), clip);
  await engine.stop();
  engine = await testEngine(port, { existingDirectory: directory });
  assert.deepEqual(await engine.api('/clips/' + clip.id + '/hook-proposals'), set);
  const conflict = await fetch(engine.origin + '/api/v1/clips/' + clip.id + '/hook-proposals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revision: clip.revision - 1 }),
  });
  assert.equal(conflict.status, 409);
  const settings = await engine.api('/settings');
  await engine.api('/settings', { ...settings, language: 'en' }, 'PUT');
  await runBrowser(engine.origin, clip.id);
  const evidence = {
    clip_id: clip.id,
    revision: clip.revision,
    proposal_count: set.proposals.length,
    quotes_verified: true,
    edit_unchanged_by_generation: true,
    persisted_after_restart: true,
    stale_revision_rejected: true,
    browser_interactions: true,
    elapsed_ms: Date.now() - started,
    data_directory: directory,
  };
  await writeFile(
    path.join(root, '.cache/hook-proposals-validation.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
} finally {
  await engine.stop();
}
