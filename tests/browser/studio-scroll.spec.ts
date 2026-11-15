import { test, expect } from '@playwright/test';
import path from 'node:path';

test('keeps one inspector scrollbar after clip creation at desktop and narrow sizes', async ({
  page,
  request,
}) => {
  const settings = await (await request.get('/api/v1/settings')).json();
  await request.put('/api/v1/settings', { data: { ...settings, language: 'en' } });
  await page.goto('/');
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/speech-face.mp4'));
  await expect(page.getByRole('heading', { name: 'speech-face.mp4' })).toBeVisible();
  await page.getByRole('button', { name: 'Create a clip', exact: true }).click();
  await page.getByLabel('Clip name').fill('Scrollbar interaction fixture');
  await page.getByRole('dialog').getByLabel('Source end (seconds)', { exact: true }).fill('4');
  await page.getByRole('dialog').getByRole('button', { name: 'Create a clip' }).click();
  for (const viewport of [
    { width: 1920, height: 1009 },
    { width: 1280, height: 720 },
    { width: 1024, height: 640 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    if (viewport.width <= 1100) {
      await page.getByRole('button', { name: 'Clip options', exact: true }).click();
    }
    await page.getByRole('tab', { name: 'Captions', exact: true }).click();
    const panel = page.getByRole('tabpanel');
    const geometry = await panel.evaluate((element) => {
      const scrolls = [];
      let parent: HTMLElement | null = element as HTMLElement;
      while (parent && parent.tagName !== 'MAIN') {
        const style = getComputedStyle(parent);
        if (
          ['auto', 'scroll'].includes(style.overflowY) &&
          parent.scrollHeight > parent.clientHeight + 1
        ) {
          scrolls.push(parent.tagName);
        }
        parent = parent.parentElement;
      }
      return {
        scrolls,
        overflow: document.documentElement.scrollWidth > innerWidth,
        scrollbar: getComputedStyle(element).scrollbarColor,
      };
    });
    expect(geometry.scrolls).toEqual(['DIV']);
    expect(geometry.overflow).toBe(false);
    expect(geometry.scrollbar).not.toBe('auto');
    await panel.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByRole('tab', { name: 'Captions', exact: true })).toBeVisible();
    await panel.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.getByRole('tab', { name: 'Clip options', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Captions', exact: true })).toBeFocused();
  }
  await page.emulateMedia({ forcedColors: 'active' });
  expect(
    await page
      .getByRole('tabpanel')
      .evaluate((element) => getComputedStyle(element).scrollbarColor),
  ).toBe('auto');
});

test('persists the economy mode and content profile and exposes the pinned small model', async ({
  page,
  request,
}) => {
  const settings = await (await request.get('/api/v1/settings')).json();
  await request.put('/api/v1/settings', { data: { ...settings, language: 'en' } });
  await page.goto('/settings');
  await page.getByLabel('Local AI mode', { exact: true }).selectOption('economy');
  await page.getByLabel('Content profile', { exact: true }).selectOption('gaming');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Local AI mode', { exact: true })).toHaveValue('economy');
  await expect(page.getByLabel('Content profile', { exact: true })).toHaveValue('gaming');
  await page.getByLabel('Choose an AI model', { exact: true }).selectOption('qwen3-1.7b');
  const models = await (await request.get('/api/v1/models')).json();
  const small = models.find((model: { id: string }) => model.id === 'qwen3-1.7b');
  expect(small.size).toBe(1282439264);
  expect(small.sha256).toBe('d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5');
});
