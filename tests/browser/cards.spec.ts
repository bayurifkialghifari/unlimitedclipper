import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { createManualClip } from './helpers';

async function corner(page: Page) {
  return page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    return Array.from(canvas.getContext('2d')!.getImageData(2, 2, 1, 1).data);
  });
}

test('cards play on independent clocks and survive autosave, exact rendering and reopening', async ({
  page,
  request,
}) => {
  const settings = await (await request.get('/api/v1/settings')).json();
  await request.put('/api/v1/settings', {
    data: { ...settings, language: 'en', auto_update: false },
  });
  const errors: string[] = [];
  page.on('pageerror', (failure) => errors.push(failure.message));
  await page.goto('/');
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/speech-face.mp4'));
  await createManualClip(page, 'Card clock fixture', 0, 2);
  await page.getByRole('tab', { name: 'Hook', exact: true }).click();
  await page.getByLabel('Opening title', { exact: true }).fill('Keep the context');
  const opening = page.getByRole('region', { name: 'Opening card', exact: true });
  const closing = page.getByRole('region', { name: 'Closing card', exact: true });
  await opening.getByRole('button', { name: 'Add card', exact: true }).focus();
  await page.keyboard.press('Enter');
  await opening.getByLabel('Display duration (s)', { exact: true }).fill('1');
  await opening.getByLabel('Background', { exact: true }).fill('#d02020');
  await closing.getByRole('button', { name: 'Add card', exact: true }).click();
  await closing.getByLabel('Display duration (s)', { exact: true }).fill('1.5');
  await closing.getByLabel('Background', { exact: true }).fill('#2030d0');
  await opening.getByRole('button', { name: 'Preview card', exact: true }).click();
  await expect.poll(async () => (await corner(page))[0]).toBeGreaterThan(180);
  const decoder = page.locator('video').first();
  await expect.poll(() => decoder.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  const player = page.getByRole('slider', { name: 'Video playhead', exact: true });
  await expect(player).toHaveAttribute('max', '4500');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => decoder.evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(0.15);
  await expect.poll(async () => Number(await player.inputValue()), { timeout: 15_000 }).toBe(4500);
  await expect.poll(async () => (await corner(page))[2]).toBeGreaterThan(180);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Render edited preview', exact: true }).click();
  await page.getByRole('button', { name: 'Edited', exact: true }).waitFor({ timeout: 120_000 });
  await expect(player).toHaveAttribute('max', '4500');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await corner(page))[0]).toBeGreaterThan(180);
  await expect
    .poll(async () => Number(await player.inputValue()), { timeout: 15_000 })
    .toBeGreaterThan(4400);
  await expect.poll(async () => (await corner(page))[2]).toBeGreaterThan(180);
  await page.reload();
  await page.getByRole('tab', { name: 'Hook', exact: true }).click();
  await expect(opening.getByLabel('Display duration (s)', { exact: true })).toHaveValue('1');
  await expect(closing.getByLabel('Display duration (s)', { exact: true })).toHaveValue('1.5');
  await closing.getByRole('button', { name: 'Remove card', exact: true }).click();
  await expect(player).toHaveAttribute('max', '3000');
  expect(errors).toEqual([]);
});
