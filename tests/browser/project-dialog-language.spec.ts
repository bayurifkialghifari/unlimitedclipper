import { expect, test } from '@playwright/test';
import path from 'node:path';
import { createManualClip } from './helpers';

test('language flags, editor layout, and project deletion work together', async ({
  page,
  request,
}) => {
  const settings = await (await request.get('/api/v1/settings')).json();
  await request.put('/api/v1/settings', {
    data: { ...settings, language: 'id', auto_update: false },
  });

  await page.goto('/settings');
  const language = page.getByRole('combobox', { name: 'Bahasa transkripsi', exact: true });
  await language.selectOption('id');
  const flag = language.locator('..').locator('img');
  await expect(flag).toBeVisible();
  expect(
    await flag.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
  ).toBe(true);
  await language.focus();
  await page.keyboard.press('ArrowDown');
  await expect(language).toHaveValue('en');
  await language.selectOption('ja');
  await expect(language.locator('option:checked')).toContainText('Jepang');
  await page.screenshot({ path: 'test-results/transcription-language.png', fullPage: true });

  await page.goto('/');
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/speech-face.mp4'));
  await createManualClip(page, 'Dialog and layout fixture', 1, 5, 'id');
  const notificationClose = page.getByRole('button', { name: 'Tutup', exact: true });
  if (await notificationClose.isVisible()) {
    await notificationClose.click();
  }
  await page.screenshot({ path: 'test-results/editor-layout-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/editor-layout-narrow.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );

  await page.goto('/');
  const matchingProjects = page.getByRole('heading', {
    name: 'speech-face.mp4',
    exact: true,
  });
  const project = matchingProjects.first();
  await expect(project).toBeVisible();
  const countBeforeDelete = await matchingProjects.count();
  const spacing = await page.evaluate(() => {
    const form = document.querySelector('input[type="url"]')?.closest('form');
    const controls = form?.parentElement?.parentElement;
    const card = document.querySelector('article');
    if (!controls || !card) {
      return 0;
    }
    return card.getBoundingClientRect().top - controls.getBoundingClientRect().bottom;
  });
  expect(spacing).toBeGreaterThanOrEqual(24);

  const card = project.locator('..').locator('..');
  await card.getByRole('button', { name: 'Hapus', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Hapus proyek?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Batal' })).toBeFocused();
  await page.screenshot({ path: 'test-results/project-delete-dialog.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(project).toBeVisible();
  await card.getByRole('button', { name: 'Hapus', exact: true }).click();
  await dialog.getByRole('button', { name: 'Batal' }).click();
  await expect(project).toBeVisible();
  await card.getByRole('button', { name: 'Hapus', exact: true }).click();
  await page.route('**/api/v1/projects/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporary delete failure' }),
      });
      return;
    }
    await route.continue();
  });
  await dialog.getByRole('button', { name: 'Ya, hapus proyek' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Temporary delete failure');
  await expect(project).toBeVisible();
  await page.unroute('**/api/v1/projects/*');
  await dialog.getByRole('button', { name: 'Ya, hapus proyek' }).click();
  await expect(matchingProjects).toHaveCount(countBeforeDelete - 1);
});
