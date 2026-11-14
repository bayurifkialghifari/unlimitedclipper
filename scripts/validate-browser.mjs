import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { root } from './cargo.mjs';
import { testEngine } from './test-engine.mjs';

const engine = await testEngine(43189);
try {
  const child = spawn(
    process.execPath,
    [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test'],
    {
      cwd: root,
      windowsHide: true,
      stdio: 'inherit',
      env: { ...process.env, UC_TEST_ORIGIN: engine.origin },
    },
  );
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  assert.equal(code, 0, 'Browser interaction validation must pass.');
} finally {
  await engine.stop();
}
