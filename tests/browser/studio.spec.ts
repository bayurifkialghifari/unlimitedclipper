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
  await page.getByLabel('Teks', { exact: true }).fill('LOCAL');
  await expect(page.getByRole('button', { name: 'LOCAL', exact: true })).toBeVisible();
  const captionPosition = page.getByLabel('Posisi vertikal (%)', { exact: true });
  await captionPosition.focus();
  await page.keyboard.press('ArrowRight');
  const savedPosition = await captionPosition.inputValue();
  for (const look of ['Studio', 'Impact', 'Kotak per kata', 'Satu kata']) {
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
