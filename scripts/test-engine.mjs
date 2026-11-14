import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { cargoEnvironment, root } from './cargo.mjs';
import { modelDirectory, toolDirectory } from './test-paths.mjs';

export async function testEngine(port = 43186) {
  const environment = cargoEnvironment();
  const engine =
    process.env.UC_TEST_ENGINE ??
    path.join(
      root,
      'target',
      ...(environment.CARGO_BUILD_TARGET ? [environment.CARGO_BUILD_TARGET] : []),
      'debug/unlimitedclipper-engine' + (process.platform === 'win32' ? '.exe' : ''),
    );
  await mkdir(path.join(root, '.cache'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.cache/editorial-'));
  const origin = 'http://127.0.0.1:' + port;
  const child = spawn(engine, [], {
    cwd: root,
    windowsHide: true,
    env: {
      ...environment,
      UC_DEV: '1',
      UC_DATA_DIR: directory,
      UC_PORT: String(port),
      UC_MODELS_DIR: modelDirectory,
      UC_MODELS_READ_ONLY: '1',
      UC_TOOLS_DIR: toolDirectory,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (bytes) => {
    errors = (errors + bytes.toString()).slice(-6000);
  });
  const exit = new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  async function api(route, body, method = body ? 'POST' : 'GET') {
    const response = await fetch(origin + '/api/v1' + route, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json();
    assert.equal(response.ok, true, JSON.stringify(result));
    return result;
  }
  async function wait(job) {
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      const current = (await api('/jobs')).find((current) => current.id === job.id);
      assert.ok(current, 'The queued job must remain visible.');
      assert.ok(
        !['failed', 'cancelled'].includes(current.status),
        current.error ?? current.message,
      );
      if (current.status === 'completed') {
        return current;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Processing exceeded its validation deadline.');
  }
  async function stop() {
    if (child.exitCode === null) {
      child.kill();
    }
    await exit;
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.equal(child.exitCode, null, errors);
    try {
      await api('/health');
      return { api, wait, stop, directory, origin };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await stop();
  throw new Error('Validation engine did not start: ' + errors);
}
