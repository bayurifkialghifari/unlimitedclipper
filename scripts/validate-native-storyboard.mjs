import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { cargoEnvironment, root } from './cargo.mjs';
import { toolDirectory } from './test-paths.mjs';

assert.equal(process.platform, 'win32', 'Native storyboard validation requires Windows.');
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
assert.ok(sdk, 'WebView2 SDK must be installed.');
const target = environment.CARGO_BUILD_TARGET ?? 'aarch64-pc-windows-gnullvm';
const binary =
  process.env.UC_NATIVE_DESKTOP_BINARY ??
  path.join(root, 'target', target, 'debug/unlimitedclipper-desktop.exe');
const origin = 'http://127.0.0.1:43198';
const fixture = path.join(root, '.cache/fixtures/speech-face.mp4');
const directory = await mkdtemp(path.join(root, '.cache/storyboard-native-'));
const runtime = path.join(directory, 'runtime');
await mkdir(runtime);
const executable = path.join(runtime, 'unlimitedclipper-desktop.exe');
await copyFile(binary, executable);
await copyFile(
  path.join(path.dirname(sdk.manifest_path), 'arm64/WebView2Loader.dll'),
  path.join(runtime, 'WebView2Loader.dll'),
);
const child = spawn(executable, [], {
  cwd: runtime,
  windowsHide: true,
  env: {
    ...environment,
    UC_DEV: '1',
    UC_PORT: '43198',
    UC_NATIVE_TEST_INSTANCE: '1',
    UC_DATA_DIR: directory,
    UC_STUDIO_DIR: path.join(root, 'apps/studio/dist'),
    UC_TOOLS_DIR: toolDirectory,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9227',
    WEBVIEW2_USER_DATA_FOLDER: path.join(directory, 'webview2'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
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
      browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  assert.ok(browser, 'Isolated WebView2 did not expose its test endpoint: ' + stderr);
  const context = browser.contexts()[0];
  let page;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    page = context.pages().find((item) => item.url().startsWith(origin));
    if (page) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(page, 'Isolated Studio page did not open.');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('button', { name: 'Impor file', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__)), true);

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
  const imported = await api('/imports/local', 'POST', { path: fixture });
  await expect
    .poll(async () => (await api('/jobs')).find((job) => job.id === imported.id)?.status, {
      timeout: 120_000,
    })
    .toBe('completed');
  const project = (await api('/projects'))[0];
  assert.ok(project);
  const clip = await api('/projects/' + project.id + '/clips', 'POST', {
    name: 'Native timeline',
    start_ms: 1000,
    end_ms: 4000,
  });
  await page.goto(origin + '/studio/' + clip.id);
  await expect(page.getByRole('heading', { name: 'Native timeline' })).toBeVisible();
  const timeline = page.getByRole('region', { name: 'Timeline', exact: true });
  await expect(timeline).toBeVisible();
  await expect
    .poll(
      () =>
        timeline
          .locator('img')
          .first()
          .evaluate((image) => image.naturalWidth),
      { timeout: 90_000 },
    )
    .toBeGreaterThan(0);
  await page.getByRole('combobox', { name: 'Composition' }).first().selectOption('gaming');
  await page.getByRole('tab', { name: 'Crop', exact: true }).click();
  const gaming = page.getByRole('region', { name: 'Gaming split' });
  await gaming.getByLabel('Left (%)').first().fill('0');
  await gaming.getByLabel('Top (%)').first().fill('0');
  await gaming.getByLabel('Width (%)').first().fill('100');
  await gaming.getByLabel('Height (%)').first().fill('100');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const beforeTracking = await api('/clips/' + clip.id);
  await page.getByRole('button', { name: 'Auto-detect facecam' }).click();
  await expect
    .poll(
      async () => {
        const job = (await api('/jobs')).find(
          (item) => item.kind === 'track' && item.clip_id === clip.id,
        );
        if (job?.status === 'failed') {
          throw new Error(job.error ?? 'Native facecam detection failed.');
        }
        return job?.status;
      },
      { timeout: 90_000 },
    )
    .toBe('completed');
  const tracked = await api('/clips/' + clip.id);
  assert.equal(tracked.document.layout, 'gaming');
  assert.deepEqual(tracked.document.gameplay_crop, beforeTracking.document.gameplay_crop);
  await expect(page.getByRole('complementary', { name: 'Progress and alerts' })).toHaveCount(0, {
    timeout: 15_000,
  });
  await page.getByRole('heading', { name: 'Gaming split', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, '.cache/native-storyboard.png'), fullPage: true });

  const second = await api('/projects/' + project.id + '/clips', 'POST', {
    name: 'Native second clip',
    start_ms: 5000,
    end_ms: 8000,
  });
  const rail = page.getByRole('region', { name: 'Clips', exact: true });
  await expect(rail.getByRole('button')).toHaveCount(2);
  await rail.getByRole('button', { name: /Native second clip/ }).click();
  await expect(page.getByRole('heading', { name: 'Native second clip' })).toBeVisible();
  assert.equal(new URL(page.url()).pathname.endsWith(second.id), true);
  assert.deepEqual(errors, []);
  const evidence = {
    source: fixture,
    native_bridge: true,
    decoded_storyboard_frame: true,
    gaming_layout: tracked.document.layout,
    facecam_job: 'completed',
    gameplay_crop_preserved: true,
    clip_rail_switch: true,
    page_errors: errors,
    screenshot: '.cache/native-storyboard.png',
  };
  await writeFile('.cache/native-storyboard-validation.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    child.kill();
  }
  await exited;
}
