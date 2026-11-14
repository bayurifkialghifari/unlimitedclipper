import { test, expect } from '@playwright/test';
import path from 'node:path';

test.beforeEach(async ({ request }) => {
  const settings = await (await request.get('/api/v1/settings')).json();
  await request.put('/api/v1/settings', {
    data: { ...settings, language: 'id', auto_update: false, component_feed: '', update_feed: '' },
  });
});

test('imports, edits, saves, reopens, renders captions and exports real media', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto('/');
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/speech-face.mp4'));
  await expect(page.getByRole('heading', { name: 'speech-face.mp4' })).toBeVisible({
    timeout: 120_000,
  });
  await page.getByRole('button', { name: 'Buat klip', exact: true }).click();
  await page.getByLabel('Nama klip').fill('Browser caption fixture');
  await page.getByLabel('Mulai (s)', { exact: true }).fill('1');
  await page.getByLabel('Selesai (s)', { exact: true }).fill('5');
  await page.getByRole('dialog').getByRole('button', { name: 'Buat klip' }).click();
  await expect(page.getByRole('button', { name: /Browser caption fixture/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Caption', exact: true }).click();
  await page.getByRole('button', { name: 'Tambah kata caption' }).click();
  await page.getByRole('tabpanel').getByLabel('Teks', { exact: true }).fill('LOCAL');
  await expect(
    page
      .getByRole('region', { name: 'Transkrip' })
      .getByRole('button', { name: 'LOCAL', exact: true }),
  ).toBeVisible();
  const captionPosition = page.getByLabel('Posisi vertikal (%)', { exact: true });
  await captionPosition.focus();
  await page.keyboard.press('ArrowRight');
  const savedPosition = await captionPosition.inputValue();
  for (const look of ['Studio', 'Impact', 'Kotak per kata', 'Satu kata', 'Kinetic']) {
    const button = page.getByRole('button', { name: look, exact: true });
    await button.focus();
    await page.keyboard.press('Space');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(captionPosition).toHaveValue(savedPosition);
  }
  await page.getByRole('button', { name: 'Studio', exact: true }).click();
  await page.getByRole('tab', { name: 'Judul', exact: true }).click();
  await page.getByLabel('Judul pembuka').fill('LOCAL CAPTION TEST');
  await expect(page.getByText('Tersimpan lokal', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Crop', exact: true }).click();
  const crop = page.getByLabel('Kiri (%)', { exact: true });
  const previous = Number(await crop.inputValue());
  await page.getByRole('button', { name: 'Atur framing dengan drag atau tombol panah' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Number(await crop.inputValue())).toBeGreaterThan(previous);
  await expect(page.getByText('Tersimpan lokal', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Putar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Jeda', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Jeda', exact: true }).click();
  await page.screenshot({ path: 'test-results/studio-desktop.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('button', { name: /Browser caption fixture/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ekspor klip', exact: true }).click();
  await page.getByRole('link', { name: 'Hasil ekspor', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Browser caption fixture.mp4' }).first(),
  ).toBeVisible({ timeout: 90_000 });
  const downloadEvent = page.waitForEvent('download', { timeout: 15_000 });
  await page.getByRole('link', { name: 'MP4', exact: true }).first().click();
  const download = (await downloadEvent).suggestedFilename();
  expect(download).toBeTruthy();
  expect(errors).toEqual([]);
});

test('supports English settings and a narrow studio without horizontal overflow', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByLabel('Bahasa tampilan').selectOption('en');
  await page.getByRole('button', { name: 'Simpan preferensi' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const secondContext = await page.context().browser()!.newContext();
  const second = await secondContext.newPage();
  await second.goto(new URL('/settings', page.url()).href);
  await expect(second.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await secondContext.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Studio', exact: true }).click();
  await page.screenshot({ path: 'test-results/studio-mobile.png', fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test('edits source segments and local layers, then plays a composed preview', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const settings = await (await request.get('/api/v1/settings')).json();
  await request.put('/api/v1/settings', { data: { ...settings, language: 'en' } });
  await page.goto('/');
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/speech-face.mp4'));
  await expect(page.getByRole('heading', { name: 'speech-face.mp4' })).toBeVisible();
  await page.getByRole('button', { name: 'Create a clip', exact: true }).click();
  await page.getByLabel('Clip name').fill('Timeline browser fixture');
  await page.getByLabel('Start (s)', { exact: true }).fill('1');
  await page.getByLabel('End (s)', { exact: true }).fill('3');
  await page.getByRole('dialog').getByRole('button', { name: 'Create a clip' }).click();
  await page.getByRole('tab', { name: 'Source segments', exact: true }).click();
  const timeline = page.getByRole('region', { name: 'Source segments', exact: true });
  await timeline.getByLabel('Start (s)', { exact: true }).last().fill('5');
  await timeline.getByLabel('End (s)', { exact: true }).last().fill('7');
  await timeline.getByRole('button', { name: 'Add source segment', exact: true }).click();
  await expect(timeline.getByRole('button', { name: 'Remove segment', exact: true })).toHaveCount(
    2,
  );
  await timeline.getByRole('button', { name: 'Add text note', exact: true }).click();
  const note = timeline.getByRole('group', { name: 'Add text note', exact: true });
  await note.getByLabel('Text', { exact: true }).fill('Local editorial fixture');
  await note.getByLabel('Horizontal position').focus();
  await page.keyboard.press('ArrowRight');
  await note.getByLabel('Vertical position', { exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await note.getByLabel('Size', { exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await note.getByLabel('Text color', { exact: true }).fill('#ffcc66');
  for (const name of [
    'Add punch-in',
    'Add split composition',
    'Add camera frame',
    'Add local B-roll',
  ]) {
    await timeline.getByRole('button', { name, exact: true }).click();
    const layer = timeline.getByRole('group', { name, exact: true });
    await layer.getByLabel('Enabled', { exact: true }).uncheck();
    await layer.getByLabel('Enabled', { exact: true }).check();
    await layer.getByLabel('Start (s)', { exact: true }).fill('0.2');
    await layer.getByLabel('End (s)', { exact: true }).fill('1.4');
    if (name === 'Add punch-in' || name === 'Add split composition') {
      await layer.getByLabel('Width (%)', { exact: true }).first().fill('40');
    }
    if (name === 'Add local B-roll') {
      await layer.getByLabel('Source offset (s)').fill('0.5');
    }
  }
  await timeline
    .getByLabel('Import local audio')
    .setInputFiles(path.resolve('.cache/fixtures/jfk.wav'));
  await timeline.getByRole('button', { name: 'Add optional tap', exact: true }).click();
  const audio = timeline
    .locator('fieldset')
    .filter({ has: page.getByRole('combobox', { name: 'Local source' }) })
    .filter({ hasNot: page.locator('legend') });
  await expect(audio.getByRole('combobox').getByRole('option', { name: 'jfk.wav' })).toHaveCount(1);
  await audio.getByRole('combobox').selectOption({ label: 'jfk.wav' });
  await audio.getByLabel('Enabled', { exact: true }).check();
  await audio.getByLabel('Source offset (s)').fill('1');
  await audio.getByLabel('Volume (%)').focus();
  await page.keyboard.press('ArrowRight');
  await audio.getByLabel('End (s)', { exact: true }).fill('0.5');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edited', exact: true }).click();
  await page.getByRole('button', { name: 'Render edited preview', exact: true }).click();
  const composed = page.getByRole('region', { name: 'Render edited preview', exact: true });
  await expect(composed.locator('video')).toBeVisible({ timeout: 90000 });
  await expect
    .poll(() => composed.locator('video').evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThan(1);
  await composed.locator('video').evaluate(async (video: HTMLVideoElement) => {
    await video.play();
  });
  await expect
    .poll(() => composed.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(0.1);
  await composed.locator('video').evaluate((video: HTMLVideoElement) => video.pause());
  await note.getByLabel('Text', { exact: true }).fill('Updated note');
  await expect(
    page.getByText('Video edits changed. Refresh the preview to review the current edit.'),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/editorial-studio.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole('button', { name: 'Clip options', exact: true }).click();
  await timeline
    .getByRole('group', { name: 'Add camera frame', exact: true })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(timeline.getByRole('group', { name: 'Add camera frame', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(timeline.getByRole('group', { name: 'Add camera frame', exact: true })).toHaveCount(
    1,
  );
  expect(errors).toEqual([]);
});
