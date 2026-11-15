import { expect, type Page } from '@playwright/test';

export async function createManualClip(
  page: Page,
  name: string,
  start = 0,
  end = 4,
  language: 'en' | 'id' = 'en',
) {
  const source = page.getByRole('heading', { name: 'speech-face.mp4', exact: true }).first();
  await expect(source).toBeVisible({ timeout: 120_000 });
  await source
    .locator('..')
    .getByRole('button', { name: language === 'en' ? 'Open project' : 'Buka proyek', exact: true })
    .click();
  await page
    .getByRole('button', { name: language === 'en' ? 'Create a clip' : 'Buat klip', exact: true })
    .click();
  await page.getByLabel(language === 'en' ? 'Clip name' : 'Nama klip', { exact: true }).fill(name);
  await page
    .getByLabel(language === 'en' ? 'Source start (seconds)' : 'Mulai di video sumber (detik)', {
      exact: true,
    })
    .fill(String(start));
  await page
    .getByLabel(language === 'en' ? 'Source end (seconds)' : 'Selesai di video sumber (detik)', {
      exact: true,
    })
    .fill(String(end));
  await page
    .getByRole('button', { name: language === 'en' ? 'Edit clip' : 'Edit klip', exact: true })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

export async function openTranscript(page: Page, language: 'en' | 'id' = 'en') {
  await page
    .getByRole('tab', { name: language === 'en' ? 'Captions' : 'Caption', exact: true })
    .click();
  const summary = page
    .locator('summary')
    .filter({ hasText: language === 'en' ? 'Transcript' : 'Transkrip' });
  if ((await summary.locator('..').getAttribute('open')) === null) {
    await summary.click();
  }
}
