import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

async function paintedPixels(page: Page, png: Buffer) {
  return page.evaluate(async (encoded) => {
    const picture = new Image();
    picture.src = 'data:image/png;base64,' + encoded;
    await picture.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.drawImage(picture, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    let total = 0;
    let squared = 0;
    let chroma = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const value = (red + green + blue) / 3;
      total += value;
      squared += value * value;
      chroma += Math.max(red, green, blue) - Math.min(red, green, blue);
    }
    const count = pixels.length / 4;
    const mean = total / count;
    return { mean, deviation: Math.sqrt(squared / count - mean * mean), chroma: chroma / count };
  }, png.toString('base64'));
}

test('manual ranges, hook timing, filters and offline sounds survive composed playback', async ({
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
  await expect(page.getByRole('heading', { name: 'speech-face.mp4' })).toBeVisible();
  await page.getByRole('button', { name: 'Create a clip', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Clip name').fill('Editor tools fixture');
  await dialog.getByLabel('Source start (seconds)').fill('1');
  await dialog.getByLabel('Source end (seconds)').fill('5');
  await expect(dialog.getByRole('status')).toContainText('4.000 s');
  await dialog.getByRole('button', { name: 'Create a clip', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('tab', { name: 'Title', exact: true }).click();
  await page.getByLabel('Opening title').fill('MAKE IT CLEAR\nKeep the context');
  await page.getByRole('button', { name: 'Clean', exact: true }).click();
  await page.getByLabel('Show from (s)').fill('0.5');
  await page.getByLabel('Display duration (s)').fill('1.2');
  await page.getByLabel('Animation', { exact: true }).selectOption('fade');
  await page.getByRole('tab', { name: 'Video filters', exact: true }).click();
  await page.getByRole('button', { name: 'Monochrome', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Monochrome', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('tab', { name: 'Source segments', exact: true }).click();
  await page.getByRole('button', { name: 'Play Whoosh 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause Whoosh 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause Whoosh 1', exact: true }).click();
  await page.getByRole('button', { name: 'Add at playhead Whoosh 1', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Local source', exact: true })).toHaveValue(/.+/);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edited', exact: true }).click();
  await page.getByRole('button', { name: 'Render edited preview', exact: true }).click();
  const composed = page.getByRole('region', { name: 'Render edited preview', exact: true });
  const video = composed.locator('video');
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState))
    .toBeGreaterThanOrEqual(2);
  await video.evaluate(async (element: HTMLVideoElement) => {
    element.muted = true;
    await element.play();
  });
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(0.2);
  await video.evaluate((element: HTMLVideoElement) => element.pause());
  const pixels = await paintedPixels(page, await video.screenshot());
  expect(pixels.mean).toBeGreaterThan(15);
  expect(pixels.deviation).toBeGreaterThan(20);
  expect(pixels.chroma).toBeLessThan(8);
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await page.getByRole('button', { name: 'Edited', exact: true }).click();
  const switched = await paintedPixels(page, await video.screenshot());
  expect(switched.mean).toBeGreaterThan(15);
  await expect(composed.locator('canvas')).toHaveCount(1);
  await page.reload();
  await page.getByRole('tab', { name: 'Title', exact: true }).click();
  await expect(page.getByLabel('Opening title')).toHaveValue('MAKE IT CLEAR\nKeep the context');
  await expect(page.getByLabel('Show from (s)')).toHaveValue('0.5');
  await expect(page.getByLabel('Animation', { exact: true })).toHaveValue('fade');
  await page.getByRole('tab', { name: 'Video filters', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Monochrome', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Natural', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(errors).toEqual([]);
});
