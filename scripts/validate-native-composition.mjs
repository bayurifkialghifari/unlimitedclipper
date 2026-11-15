import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { cargoEnvironment, root } from './cargo.mjs';
import { toolDirectory, modelDirectory } from './test-paths.mjs';

assert.equal(process.platform, 'win32', 'This fixture verifies native Windows WebView2.');
const environment = cargoEnvironment();
const narrationPack = process.env.UC_NATIVE_NARRATION_PACK;
const metadata = JSON.parse(
  execFileSync('cargo', ['metadata', '--locked', '--format-version', '1'], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  }),
);
const sdk = metadata.packages.find((item) => item.name === 'webview2-com-sys');
assert.ok(sdk);
await mkdir(path.join(root, '.cache'), { recursive: true });
const directory = await mkdtemp(path.join(root, '.cache/editorial-native-'));
const runtime = path.join(directory, 'runtime');
await mkdir(runtime);
const executable = path.join(runtime, 'unlimitedclipper-desktop.exe');
await copyFile(
  path.join(
    metadata.target_directory,
    environment.CARGO_BUILD_TARGET,
    'debug/unlimitedclipper-desktop.exe',
  ),
  executable,
);
await copyFile(
  path.join(path.dirname(sdk.manifest_path), 'arm64/WebView2Loader.dll'),
  path.join(runtime, 'WebView2Loader.dll'),
);
const fixture = path.join(directory, 'podcast.mp4');
execFileSync(
  path.join(toolDirectory, 'ffmpeg/ffmpeg.exe'),
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    process.argv[3] ?? (process.argv[2] ? '0' : '600'),
    '-i',
    path.resolve(
      process.argv[2] ?? path.join(root, '.data/sources/107f3d5e-c355-45d7-a498-f2ae72b2758b.mp4'),
    ),
    '-t',
    '8',
    '-vf',
    'scale=960:-2',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-threads',
    '2',
    '-c:a',
    'aac',
    '-pix_fmt',
    'yuv420p',
    fixture,
  ],
  { windowsHide: true, timeout: 90_000 },
);
const child = spawn(executable, [], {
  cwd: runtime,
  windowsHide: true,
  env: {
    ...environment,
    UC_DEV: '1',
    UC_PORT: '43197',
    UC_DATA_DIR: directory,
    UC_STUDIO_DIR: path.join(root, 'apps/studio/dist'),
    UC_TOOLS_DIR: toolDirectory,
    UC_MODELS_DIR: narrationPack ?? modelDirectory,
    UC_MODELS_READ_ONLY: '1',
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9226',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exit = new Promise((resolve, reject) => {
  child.once('exit', resolve);
  child.once('error', reject);
});
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.equal(child.exitCode, null, 'Isolated native application must remain running.');
    try {
      browser = await chromium.connectOverCDP('http://127.0.0.1:9226');
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  assert.ok(browser, 'Isolated native WebView2 must expose its test endpoint.');
  const context = browser.contexts()[0];
  let page;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    page = context.pages().find((item) => item.url().startsWith('http://127.0.0.1:43197'));
    if (page) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(page);
  const errors = [];
  page.on('pageerror', (failure) => errors.push(failure.message));
  await page.getByRole('button', { name: 'Impor file', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__)), true);
  const imported = await page.evaluate(async (fixturePath) => {
    const response = await fetch('/api/v1/imports/local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: fixturePath }),
    });
    return response.json();
  }, fixture);
  assert.ok(imported.id, JSON.stringify(imported));
  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const jobs = await (await fetch('/api/v1/jobs')).json();
          const job = jobs.find((job) => job.id === id);
          if (['failed', 'cancelled'].includes(job?.status)) {
            throw new Error(job.error ?? job.status);
          }
          return job?.status;
        }, imported.id),
      { timeout: 120_000 },
    )
    .toBe('completed');
  const projects = await page.evaluate(async () => {
    const response = await fetch('/api/v1/projects');
    return { status: response.status, body: await response.json() };
  });
  assert.equal(projects.status, 200, JSON.stringify(projects));
  assert.ok(Array.isArray(projects.body) && projects.body.length, JSON.stringify(projects));
  const clip = await page.evaluate(async () => {
    const project = (await (await fetch('/api/v1/projects')).json())[0];
    const response = await fetch('/api/v1/projects/' + project.id + '/clips', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Native composition fixture', start_ms: 0, end_ms: 6000 }),
    });
    return response.json();
  });
  await page.goto('http://127.0.0.1:43197/studio/' + clip.id);
  await page.getByRole('tab', { name: 'Hook', exact: true }).click();
  await page.getByLabel('Judul pembuka').fill('NATIVE PREVIEW');
  await page.getByText('Tersimpan lokal', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Putar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.3);
  await page.getByRole('button', { name: 'Jeda', exact: true }).click();
  const signature = await page.locator('canvas').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0;
    let chroma = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      total += (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
      chroma +=
        Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) -
        Math.min(pixels[index], pixels[index + 1], pixels[index + 2]);
    }
    return { mean: total / (pixels.length / 4), chroma: chroma / (pixels.length / 4) };
  });
  assert.ok(
    signature.mean > 15 && signature.chroma > 5,
    'Native live canvas must paint actual media frames.',
  );
  await page.screenshot({
    path: path.join(root, '.cache/native-composition-live.png'),
    fullPage: true,
  });
  const nativeFrameHash = () =>
    page.locator('canvas').evaluate((canvas) => {
      const context = canvas.getContext('2d');
      let total = 0;
      for (let y = 0; y < 12; y += 1) {
        for (let x = 0; x < 12; x += 1) {
          const pixel = context.getImageData(
            Math.floor((canvas.width * (x + 0.5)) / 12),
            Math.floor((canvas.height * (y + 0.5)) / 12),
            1,
            1,
          ).data;
          total += pixel[0] * 3 + pixel[1] * 5 + pixel[2] * 7;
        }
      }
      return total;
    });
  const beforeMotion = await nativeFrameHash();
  await page.getByRole('tab', { name: 'Crop', exact: true }).click();
  const motion = page.getByRole('region', { name: 'Gerak kamera', exact: true });
  await motion.getByRole('button', { name: 'Tambah keyframe kamera di playhead' }).click();
  await motion.getByLabel('Zoom (%)', { exact: true }).fill('200');
  await motion.getByLabel('Tengah X (%)', { exact: true }).fill('75');
  await expect
    .poll(async () => Math.abs((await nativeFrameHash()) - beforeMotion))
    .toBeGreaterThan(500);
  await page.getByText('Tersimpan lokal', { exact: true }).waitFor();
  const beforeBroll = await nativeFrameHash();
  await page.getByRole('tab', { name: 'Segmen sumber', exact: true }).click();
  await page.getByRole('button', { name: 'Tambah B-roll lokal', exact: true }).click();
  await expect
    .poll(async () => Math.abs((await nativeFrameHash()) - beforeBroll))
    .toBeGreaterThan(500);
  const mediaMotion = page.getByRole('region', { name: 'Gerak B-roll', exact: true });
  const staticBroll = await nativeFrameHash();
  await mediaMotion.getByRole('button', { name: 'Tambah keyframe B-roll di playhead' }).click();
  await mediaMotion.getByLabel('Skala (%)', { exact: true }).fill('160');
  await mediaMotion.getByLabel('Opasitas (%)', { exact: true }).fill('50');
  await expect
    .poll(async () => Math.abs((await nativeFrameHash()) - staticBroll))
    .toBeGreaterThan(500);
  await page.getByText('Tersimpan lokal', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Filter video', exact: true }).click();
  await page.getByRole('button', { name: 'Monokrom', exact: true }).click();
  await page.getByText('Tersimpan lokal', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Render preview hasil edit', exact: true }).click();
  await page.getByRole('button', { name: 'Hasil edit', exact: true }).waitFor({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Putar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.3);
  await page.getByRole('button', { name: 'Jeda', exact: true }).click();
  await page.screenshot({
    path: path.join(root, '.cache/native-composition-exact.png'),
    fullPage: true,
  });
  await page.getByRole('tab', { name: 'Hook', exact: true }).click();
  const opening = page.getByRole('region', { name: 'Kartu pembuka', exact: true });
  const closing = page.getByRole('region', { name: 'Kartu penutup', exact: true });
  await opening.getByRole('button', { name: 'Tambah kartu', exact: true }).click();
  await opening.getByLabel('Durasi tampil (s)', { exact: true }).fill('1');
  await opening.getByLabel('Latar belakang', { exact: true }).fill('#d02020');
  await closing.getByRole('button', { name: 'Tambah kartu', exact: true }).click();
  await closing.getByLabel('Durasi tampil (s)', { exact: true }).fill('1.5');
  await closing.getByLabel('Latar belakang', { exact: true }).fill('#2030d0');
  if (narrationPack) {
    await opening.getByLabel('Teks kartu', { exact: true }).fill('Halo dunia.');
    await opening.getByLabel('Durasi tampil (s)', { exact: true }).fill('3');
    const generate = opening.getByRole('button', { name: 'Buat narasi', exact: true });
    await expect(generate).toBeEnabled({ timeout: 30_000 });
    await generate.click();
    const apply = opening.getByRole('button', { name: 'Pakai narasi ini', exact: true });
    await expect(apply).toBeEnabled({ timeout: 120_000 });
    await apply.click();
    await opening.getByRole('button', { name: 'Hapus narasi', exact: true }).waitFor();
    await opening.getByRole('button', { name: 'Preview kartu', exact: true }).click();
    await page.getByRole('button', { name: 'Putar', exact: true }).click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const audio = document.querySelector('audio[aria-hidden="true"]');
            return audio?.currentTime ?? 0;
          }),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0.15);
    await page.getByRole('button', { name: 'Jeda', exact: true }).click();
  }
  await opening.getByRole('button', { name: 'Preview kartu', exact: true }).click();
  const corner = async () => {
    const screenshot = await page.locator('canvas').screenshot();
    return page.evaluate(async (encoded) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + encoded;
      await image.decode();
      const sample = document.createElement('canvas');
      sample.width = image.width;
      sample.height = image.height;
      const context = sample.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let ink = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] > 180 && pixels[index + 1] > 150 && pixels[index + 2] > 70) {
          ink += 1;
        }
      }
      return [
        ...Array.from(
          context.getImageData(Math.round(image.width * 0.2), Math.round(image.height * 0.8), 1, 1)
            .data,
        ),
        ink,
      ];
    }, screenshot.toString('base64'));
  };
  await expect.poll(async () => (await corner())[0]).toBeGreaterThan(180);
  await page.getByRole('button', { name: 'Putar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.3);
  await page.getByRole('button', { name: 'Jeda', exact: true }).click();
  await closing.getByRole('button', { name: 'Preview kartu', exact: true }).click();
  await expect.poll(async () => (await corner())[2]).toBeGreaterThan(180);
  await expect.poll(async () => (await corner())[4]).toBeGreaterThan(10);
  await page.screenshot({
    path: path.join(root, '.cache/native-composition-card.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Render preview hasil edit', exact: true }).click();
  await page.getByRole('button', { name: 'Hasil edit', exact: true }).waitFor({ timeout: 120_000 });
  await page
    .getByText('Memuat video preview...', { exact: true })
    .waitFor({ state: 'hidden', timeout: 120_000 });
  await expect.poll(async () => (await corner())[2]).toBeGreaterThan(180);
  await expect.poll(async () => (await corner())[4]).toBeGreaterThan(10);
  await page.screenshot({
    path: path.join(root, '.cache/native-composition-card-exact.png'),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(root, '.cache/native-composition-validation.json'),
    JSON.stringify(
      {
        directory,
        native_bridge: true,
        actual_media: true,
        live_frame: signature,
        camera_motion: true,
        media_motion: true,
        exact_playback: true,
        independent_cards: true,
        native_card_narration: Boolean(narrationPack),
        single_canvas: (await page.locator('canvas').count()) === 1,
        errors,
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    await readFile(path.join(root, '.cache/native-composition-validation.json'), 'utf8'),
  );
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    child.kill();
  }
  await exit;
}
