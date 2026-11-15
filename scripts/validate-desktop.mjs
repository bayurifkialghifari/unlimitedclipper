import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root } from './cargo.mjs';

const browser = await chromium.connectOverCDP(process.env.UC_TEST_CDP ?? 'http://127.0.0.1:9222');
const context = browser.contexts()[0];
const origin = process.env.UC_TEST_ORIGIN ?? 'http://127.0.0.1:43179';
const page = context.pages().find((page) => page.url().startsWith(origin));
assert.ok(page, 'Installed desktop must create its local studio window.');
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.getByRole('button', { name: 'Impor file', exact: true }).waitFor();
const tauri = await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__));
assert.equal(tauri, true, 'The installed studio must have the native bridge.');
await page.getByRole('button', { name: 'Impor file', exact: true }).click();
await new Promise((resolve) => setTimeout(resolve, 1500));
const processId =
  process.env.UC_TEST_APP_PID ??
  (await readFile(path.join(root, '.cache/native-process-id.txt'), 'utf8')).trim();
execFileSync(
  'powershell',
  [
    '-NoProfile',
    '-File',
    path.join(root, 'scripts/select-native-file.ps1'),
    '-ApplicationProcessId',
    processId,
    '-FixturePath',
    path.join(root, '.cache/fixtures/speech-face.mp4'),
  ],
  { windowsHide: true, stdio: 'inherit' },
);
await page
  .getByRole('heading', { name: 'speech-face.mp4', exact: true })
  .waitFor({ timeout: 120_000 });
await page.getByRole('button', { name: 'Buat klip', exact: true }).click();
await page.getByLabel('Nama klip').fill('Installed desktop fixture');
await page
  .getByRole('dialog')
  .getByLabel('Mulai di video sumber (detik)', { exact: true })
  .fill('1');
await page
  .getByRole('dialog')
  .getByLabel('Selesai di video sumber (detik)', { exact: true })
  .fill('3');
await page.getByRole('dialog').getByRole('button', { name: 'Buat klip' }).click();
await page.getByRole('tab', { name: 'Judul', exact: true }).click();
await page.getByLabel('Judul pembuka').fill('INSTALLED DESKTOP');
await page.getByText('Tersimpan lokal', { exact: true }).waitFor();
await page.getByRole('tab', { name: 'Caption', exact: true }).click();
await page.getByRole('button', { name: 'Kinetic', exact: true }).click();
await page.getByRole('tab', { name: 'Segmen sumber', exact: true }).click();
const timeline = page.getByRole('region', { name: 'Segmen sumber', exact: true });
await timeline.getByRole('button', { name: 'Tambah catatan teks', exact: true }).click();
await timeline.getByLabel('Teks', { exact: true }).fill('NATIVE EDITORIAL');
await page.getByText('Tersimpan lokal', { exact: true }).waitFor();
await page.getByRole('button', { name: 'Render preview hasil edit', exact: true }).click();
await page.locator('video[src*="/api/v1/assets/"]').waitFor({ timeout: 120_000 });
await page.waitForFunction(() => {
  const video = document.querySelector('video');
  return video && video.readyState > 1;
});
await page.locator('video').evaluate(async (video) => {
  await video.play();
});
await page.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 0.1);
await page.locator('video').evaluate((video) => video.pause());
await page.screenshot({ path: path.join(root, '.cache/native-studio.png'), fullPage: true });
await page.getByRole('button', { name: 'Ekspor klip', exact: true }).click();
await page.getByRole('link', { name: 'Hasil ekspor', exact: true }).click();
await page
  .getByRole('heading', { name: 'Installed desktop fixture.mp4', exact: true })
  .waitFor({ timeout: 120_000 });
assert.deepEqual(errors, []);
const evidence = {
  native_bridge: true,
  native_file_dialog: 'passed',
  import: 'passed',
  autosave: 'passed',
  export: 'passed',
  kinetic: 'passed',
  editorial_note: 'passed',
  composed_preview_playback: 'passed',
  errors,
};
await writeFile(
  path.join(root, '.cache/desktop-validation.json'),
  JSON.stringify(evidence, null, 2),
);
process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
await browser.close();
