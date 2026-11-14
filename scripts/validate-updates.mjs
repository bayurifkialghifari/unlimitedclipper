import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root } from './cargo.mjs';
import { fixtureDirectory, testDataDirectory } from './test-paths.mjs';

const directory = path.join(root, '.cache/update-fixture');
const environment = {
  ...process.env,
  TAURI_SIGNING_PRIVATE_KEY_PATH: path.join(root, '.cache/signing/development.key'),
};
execFileSync(
  process.execPath,
  [
    path.join(root, 'scripts/release-manifest.mjs'),
    '--version=0.1.1',
    '--platform=windows-arm64',
    '--file=' + path.join(fixtureDirectory, 'components.zip'),
    '--url=http://127.0.0.1:9999/components.zip',
    '--out=' + directory,
    '--development',
  ],
  { env: environment, stdio: 'inherit', windowsHide: true },
);
const valid = JSON.parse(await readFile(path.join(directory, 'components.json'), 'utf8'));
async function signed(manifest) {
  const filename = path.join(directory, 'scenario.json');
  const content = JSON.stringify(manifest);
  await writeFile(filename, content);
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'),
      'signer',
      'sign',
      '-f',
      path.join(root, '.cache/signing/development.key'),
      filename,
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  return {
    manifest: content,
    signature: Buffer.from((await readFile(filename + '.sig', 'utf8')).trim(), 'base64').toString(
      'utf8',
    ),
  };
}
let envelope = { ...valid, manifest: valid.manifest.replace('0.1.1', '9.9.9') };
let slow = false;
const server = createServer((request, response) => {
  if (request.url === '/components.json') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(envelope));
  } else if (request.url === '/components.zip') {
    const stream = createReadStream(path.join(fixtureDirectory, 'components.zip'));
    if (slow) {
      stream.on('data', () => {
        stream.pause();
        setTimeout(() => stream.resume(), 50);
      });
    }
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } else {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(9999, '127.0.0.1', resolve));
async function api(route, body, method = 'POST', acceptFailure = false) {
  const response = await fetch('http://127.0.0.1:43179/api/v1' + route, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!acceptFailure) {
    assert.equal(response.ok, true, JSON.stringify(data));
  }
  return { ok: response.ok, data };
}
async function wait(id) {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const { data } = await api('/jobs', undefined, 'GET');
    const job = data.find((item) => item.id === id);
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Update validation timed out.');
}
async function restart() {
  await api('/updates/restart');
  await new Promise((resolve) => setTimeout(resolve, 2500));
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const { data: update } = await api('/updates', undefined, 'GET');
      if (!update.restart_required) {
        return update;
      }
    } catch {
      // Restart briefly releases the old server and its instance lock.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('The updated engine did not restart.');
}
try {
  const { data: settings } = await api('/settings', undefined, 'GET');
  await api(
    '/settings',
    { ...settings, component_feed: 'http://127.0.0.1:9999/components.json', auto_update: false },
    'PUT',
  );
  const rejected = await wait((await api('/updates/check')).data.id);
  assert.equal(rejected.status, 'failed');
  process.stdout.write('Tampered manifest rejected: ' + rejected.error + '\n');
  const manifest = JSON.parse(valid.manifest);
  const artifact = manifest.platforms['windows-arm64'];
  envelope = await signed({ ...manifest, platforms: { 'windows-x64': artifact } });
  const architecture = await wait((await api('/updates/check')).data.id);
  assert.match(architecture.error, /architecture/);
  envelope = await signed({
    ...manifest,
    platforms: { 'windows-arm64': { ...artifact, sha256: '0'.repeat(64) } },
  });
  const hash = await wait((await api('/updates/check')).data.id);
  assert.match(hash.error, /checksum/);
  envelope = valid;
  slow = true;
  const cancelled = (await api('/updates/check')).data;
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await api('/jobs/' + cancelled.id + '/cancel');
  assert.equal((await wait(cancelled.id)).status, 'cancelled');
  slow = false;
  await api('/jobs/' + cancelled.id + '/retry');
  const staged = await wait(cancelled.id);
  assert.equal(staged.status, 'completed', staged.error);
  const { data: update } = await api('/updates', undefined, 'GET');
  assert.equal(update.ready, true);
  const client_id = crypto.randomUUID();
  await api('/activity', { client_id, dirty: true });
  const deferred = await api('/updates/install', undefined, 'POST', true);
  assert.equal(deferred.ok, false);
  await api('/activity', { client_id, dirty: false });
  const activated = await api('/updates/install');
  assert.equal(activated.data.ready, false);
  assert.equal((await restart()).version, '0.1.1');
  const health = await api('/health', undefined, 'GET');
  assert.ok(Object.values(health.data.tools).every(Boolean));
  envelope = await signed({ ...manifest, version: '0.1.2' });
  const second = await wait((await api('/updates/check')).data.id);
  assert.equal(second.status, 'completed', second.error);
  await api('/updates/install');
  assert.equal((await restart()).version, '0.1.2');
  await api('/updates/rollback');
  assert.equal((await restart()).version, '0.1.1');
  const active = JSON.parse(
    await readFile(path.join(testDataDirectory, 'active-component.json'), 'utf8'),
  );
  assert.equal(active.directory, update.directory);
  await api('/updates/rollback');
  assert.equal((await restart()).version, '');
  const evidence = {
    tampered_signature: 'rejected',
    wrong_architecture: 'rejected',
    bad_checksum: 'rejected',
    cancellation_and_retry: 'passed',
    staged_version: update.version,
    dirty_editor: 'deferred',
    activation: 'passed',
    rollback: 'passed',
    restart_persistence: 'passed',
  };
  await writeFile(
    path.join(root, '.cache/update-validation.json'),
    JSON.stringify(evidence, null, 2),
  );
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
  await api('/settings', settings, 'PUT');
} finally {
  server.close();
}
