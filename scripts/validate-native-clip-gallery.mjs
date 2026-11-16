import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { cargoEnvironment, root } from './cargo.mjs';
import { toolDirectory } from './test-paths.mjs';

assert.equal(process.platform, 'win32');
const environment = cargoEnvironment();
const metadata = JSON.parse(
  execFileSync('cargo', ['metadata', '--locked', '--format-version', '1'], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  }),
);
const sdk = metadata.packages.find((item) => item.name === 'webview2-com-sys');
assert.ok(sdk);
const binary = path.join(
  metadata.target_directory,
  environment.CARGO_BUILD_TARGET ?? 'aarch64-pc-windows-gnullvm',
  'debug/unlimitedclipper-desktop.exe',
);
const directory = await mkdtemp(path.join(root, '.cache/gallery-native-'));
const runtime = path.join(directory, 'runtime');
await mkdir(runtime);
const executable = path.join(runtime, 'unlimitedclipper-desktop.exe');
await copyFile(binary, executable);
await copyFile(
  path.join(path.dirname(sdk.manifest_path), 'arm64/WebView2Loader.dll'),
  path.join(runtime, 'WebView2Loader.dll'),
);
const origin = 'http://127.0.0.1:43213';
const child = spawn(executable, [], {
  cwd: runtime,
  windowsHide: true,
  env: {
    ...environment,
    UC_DEV: '1',
    UC_PORT: '43213',
    UC_NATIVE_TEST_INSTANCE: '1',
    UC_DATA_DIR: directory,
    UC_STUDIO_DIR: path.join(root, 'apps/studio/dist'),
    UC_TOOLS_DIR: toolDirectory,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9235',
    WEBVIEW2_USER_DATA_FOLDER: path.join(directory, 'webview2'),
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (bytes) => {
  stderr = (stderr + bytes.toString()).slice(-6000);
});
const exited = new Promise((resolve, reject) => {
  child.once('exit', resolve);
  child.once('error', reject);
});
let browser;

try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.equal(child.exitCode, null, stderr);
    try {
      browser = await chromium.connectOverCDP('http://127.0.0.1:9235');
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  assert.ok(browser, stderr);
  const context = browser.contexts()[0];
  let page;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    page = context.pages().find((item) => item.url().startsWith(origin));
    if (page) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(page, 'The native Studio did not open.');
  await page.setViewportSize({ width: 1600, height: 1000 });
  assert.equal(await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__)), true);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  async function api(route, method = 'GET', body) {
    return page.evaluate(
      async ({ route, method, body }) => {
        const response = await fetch('/api/v1' + route, {
          method,
          headers: { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(JSON.stringify(result));
        }
        return result;
      },
      { route, method, body },
    );
  }

  const settings = await api('/settings');
  await api('/settings', 'PUT', { ...settings, language: 'en', auto_update: false });
  const imported = await api('/imports/local', 'POST', {
    path: path.join(root, 'docs/media/editor-demo.mp4'),
  });
  await expect
    .poll(async () => (await api('/jobs')).find((job) => job.id === imported.id)?.status, {
      timeout: 120_000,
    })
    .toBe('completed');
  const project = (await api('/projects'))[0];
  assert.ok(project);
  const first = await api('/projects/' + project.id + '/clips', 'POST', {
    name: 'Podcast opening',
    start_ms: 0,
    end_ms: 4000,
  });
  const second = await api('/projects/' + project.id + '/clips', 'POST', {
    name: 'Podcast response',
    start_ms: 8000,
    end_ms: 12000,
  });
  await page.goto(origin + '/projects/' + project.id);
  const cards = page.locator('article[data-clip-id]');
  await expect(cards).toHaveCount(2);
  await expect.poll(async () => cards.locator('img').count(), { timeout: 60_000 }).toBe(2);
  const frames = await cards
    .locator('img')
    .evaluateAll((images) => images.map((image) => new URL(image.src).pathname));
  assert.notEqual(frames[0], frames[1]);
  await page.screenshot({ path: path.join(root, 'docs/media/clips.png') });
  await cards.getByRole('button', { name: 'Play edited clip: ' + first.name }).click();
  const dialog = page.getByRole('dialog', { name: first.name });
  await expect(dialog).toBeVisible();
  const video = dialog.locator('video');
  await expect(video).toBeVisible({ timeout: 120_000 });
  await expect
    .poll(() => video.evaluate((element) => element.readyState), { timeout: 30_000 })
    .toBeGreaterThan(1);
  await video.evaluate(async (element) => {
    element.muted = true;
    await element.play();
  });
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(0.2);
  await page.screenshot({ path: path.join(root, '.cache/native-clip-review.png') });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).not.toBeVisible();
  assert.deepEqual(errors, []);
  const evidence = {
    native_bridge: true,
    source: 'docs/media/editor-demo.mp4',
    clip_ids: [first.id, second.id],
    frame_assets: frames,
    edited_preview_played: true,
    page_errors: errors,
  };
  await writeFile(
    path.join(root, '.cache/native-clip-gallery-validation.json'),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    child.kill();
  }
  await exited;
}
