import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cargoEnvironment, root } from './cargo.mjs';

const environment = cargoEnvironment();
const target = environment.CARGO_BUILD_TARGET;
const engine =
  process.env.UC_TEST_ENGINE ??
  path.join(
    root,
    'target',
    ...(target ? [target] : []),
    'debug',
    'unlimitedclipper-engine' + (process.platform === 'win32' ? '.exe' : ''),
  );
await mkdir(path.join(root, '.cache'), { recursive: true });
const directory = await mkdtemp(path.join(root, '.cache/recovery-'));
const origin = 'http://127.0.0.1:' + (process.env.UC_TEST_PORT ?? '43182');
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let processHandle;
let processExit;

async function api(route, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(origin + '/api/v1' + route, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.equal(response.ok, true, JSON.stringify(result));
  return result;
}

async function start() {
  processHandle = spawn(engine, [], {
    cwd: root,
    env: {
      ...environment,
      UC_DEV: '1',
      UC_DATA_DIR: directory,
      UC_PORT: new URL(origin).port,
    },
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let errors = '';
  processHandle.stderr.on('data', (bytes) => {
    errors += bytes.toString();
  });
  processExit = new Promise((resolve, reject) => {
    processHandle.once('exit', resolve);
    processHandle.once('error', reject);
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.equal(processHandle.exitCode, null, errors);
    try {
      await api('/health');
      return;
    } catch {
      await pause(100);
    }
  }
  throw new Error('The recovery fixture engine did not start: ' + errors);
}

async function stop() {
  if (processHandle && processHandle.exitCode === null) {
    processHandle.kill();
    await processExit;
  }
}

async function wait(id, predicate = (job) => job.status === 'completed') {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const job = (await api('/jobs')).find((item) => item.id === id);
    assert.ok(job);
    if (predicate(job)) {
      return job;
    }
    assert.ok(!['failed', 'cancelled'].includes(job.status), job.error ?? job.message);
    await pause(100);
  }
  throw new Error('The recovery fixture job exceeded its deadline.');
}

async function fingerprint(filename) {
  return {
    hash: createHash('sha256')
      .update(await readFile(filename))
      .digest('hex'),
    modified: (await stat(filename)).mtimeMs,
  };
}

try {
  await start();
  const imported = await api('/imports/local', {
    path: path.join(root, '.cache/fixtures/speech-face.mp4'),
  });
  const projectId = (await wait(imported.id)).project_id;
  const clips = [];
  for (let index = 0; index < 5; index += 1) {
    const clip = await api('/projects/' + projectId + '/clips', {
      name: 'Recovery fixture ' + index,
      start_ms: 1000,
      end_ms: 5000,
    });
    clip.document.resolution = 720;
    clip.document.title.text = 'IMMUTABLE REVISION';
    clips.push(await api('/clips/' + clip.id, clip, 'PUT'));
  }
  const batch = await api('/projects/' + projectId + '/export', {});
  const edited = clips[0];
  edited.document.title.text = 'EDITED AFTER QUEUE';
  await api('/clips/' + edited.id, edited, 'PUT');
  const partial = await wait(batch.id, (job) => job.payload.completed_exports?.length >= 1);
  assert.ok(partial.payload.completed_exports.length < clips.length);
  await api('/jobs/' + batch.id + '/cancel', {});
  const cancelled = await wait(batch.id, (job) => job.status === 'cancelled');
  const completedIds = cancelled.payload.completed_exports.map((item) => item.export_id);
  const savedFiles = new Map();
  for (const id of completedIds) {
    savedFiles.set(id, await fingerprint(path.join(directory, 'exports', id + '.mp4')));
  }
  await api('/jobs/' + batch.id + '/retry', {});
  const finished = await wait(batch.id);
  assert.equal(finished.payload.completed_exports.length, clips.length);
  const records = await api('/exports');
  assert.equal(records.length, clips.length);
  for (const record of records) {
    assert.equal(record.revision, 2);
  }
  for (const [id, saved] of savedFiles) {
    assert.deepEqual(await fingerprint(path.join(directory, 'exports', id + '.mp4')), saved);
  }
  const allFiles = new Map();
  for (const record of records) {
    allFiles.set(record.id, await fingerprint(path.join(directory, 'exports', record.id + '.mp4')));
  }
  await stop();
  // Reproduce an interrupted job checkpoint after immutable exports were committed.
  const database = new DatabaseSync(path.join(directory, 'studio.sqlite'));
  const row = database.prepare('SELECT data FROM jobs WHERE id = ?').get(batch.id);
  const interrupted = JSON.parse(row.data);
  interrupted.status = 'running';
  interrupted.payload.completed_exports = [];
  database
    .prepare('UPDATE jobs SET status = ?, data = ? WHERE id = ?')
    .run(interrupted.status, JSON.stringify(interrupted), batch.id);
  database.close();
  await start();
  const interruptedJob = await wait(batch.id, (job) => job.status === 'failed');
  assert.match(interruptedJob.error, /application stopped/i);
  await api('/jobs/' + batch.id + '/retry', {});
  const recovered = await wait(batch.id);
  assert.equal(recovered.payload.completed_exports.length, clips.length);
  assert.equal((await api('/exports')).length, clips.length);
  for (const [id, saved] of allFiles) {
    assert.deepEqual(await fingerprint(path.join(directory, 'exports', id + '.mp4')), saved);
  }
  const evidence = {
    data_directory: directory,
    immutable_revision: 2,
    exports: records.length,
    preserved_after_cancel: completedIds.length,
    preserved_after_restart: allFiles.size,
    duplicate_exports: 0,
  };
  await writeFile(
    path.join(root, '.cache/recovery-validation.json'),
    JSON.stringify(evidence, null, 2),
  );
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
} finally {
  await stop();
}
