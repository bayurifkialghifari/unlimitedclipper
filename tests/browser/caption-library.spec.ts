import { test, expect } from '@playwright/test';
import path from 'node:path';
import { createManualClip } from './helpers';
import type { ClipRating, Job, ModelStatus } from '../../apps/studio/src/types';

test('edits and reuses caption styles, then reviews rating states without losing edits', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const settings = await (await request.get('/api/v1/settings')).json();
  await request.put('/api/v1/settings', { data: { ...settings, language: 'en' } });
  let modelReady = true;
  let rating: ClipRating | null = null;
  let ratingRequests = 0;
  let finishRating: (() => void) | undefined;
  let failRating = false;
  await page.route('**/api/v1/models', async (route) => {
    const response = await route.fetch();
    const models: ModelStatus[] = await response.json();
    await route.fulfill({
      json: models.map((model) =>
        model.id === 'qwen3-4b' ? { ...model, ready: modelReady } : model,
      ),
    });
  });
  await page.route('**/api/v1/clips/*/rating', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: rating });
      return;
    }
    ratingRequests += 1;
    if (failRating) {
      await route.fulfill({ status: 500, json: { error: 'Controlled rating failure' } });
      return;
    }
    const body = route.request().postDataJSON() as { revision: number };
    const id = new URL(route.request().url()).pathname.split('/')[4];
    await new Promise<void>((resolve) => {
      finishRating = resolve;
    });
    rating = {
      clip_id: id,
      revision: body.revision,
      score: 80,
      summary: 'Controlled transcript review for browser interaction testing.',
      dimensions: ['hook', 'clarity', 'flow', 'payoff'].map((key) => ({
        key,
        score: 20,
        explanation: 'Controlled evidence explanation.',
        quote: 'LOCAL',
      })),
      suggestions: ['Keep the complete spoken phrase.'],
      model: 'UI fixture',
      created_at: Date.now(),
    };
    const job: Job = {
      id: 'rating-ui-fixture',
      kind: 'assess',
      status: 'completed',
      stage: 'rating',
      progress: 1,
      message: 'Controlled rating response',
      payload: { rating },
      clip_id: id,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await route.fulfill({ json: job });
  });

  await page.goto('/');
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/speech-face.mp4'));
  await createManualClip(page, 'Caption library browser fixture');
  await page.getByRole('tab', { name: 'Captions', exact: true }).click();
  await page.getByRole('button', { name: 'Add caption word', exact: true }).click();
  await page.getByRole('tabpanel').getByLabel('Text', { exact: true }).fill('LOCAL');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const gallery = page.getByRole('group', { name: 'Caption looks', exact: true });
  await expect(gallery.getByRole('button')).toHaveCount(18);
  expect(
    await page.evaluate(async () => {
      const fonts = await document.fonts.load('700 16px "Noto Sans"');
      return fonts.length > 0 && fonts.every((font) => font.status === 'loaded');
    }),
  ).toBe(true);
  await page.getByRole('button', { name: 'Motion', exact: true }).click();
  await expect(gallery.getByRole('button')).toHaveCount(3);
  await gallery.getByRole('button', { name: 'Reveal', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(gallery.getByRole('button', { name: 'Reveal', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('summary').filter({ hasText: 'Save this style' }).click();
  await page.getByLabel('Style name').fill('Interview browser style');
  await page.getByRole('button', { name: 'Save this style', exact: true }).click();
  await expect(
    gallery.getByRole('button', { name: 'Interview browser style', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Style saved. You can use it in another clip.')).toBeVisible();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const projectId = await page.evaluate(() => localStorage.getItem('uc-project'));
  const project = await (await request.get('/api/v1/projects/' + projectId)).json();
  const first = project.clips.find(
    (clip: { name: string }) => clip.name === 'Caption library browser fixture',
  );
  const second = await (
    await request.post('/api/v1/projects/' + projectId + '/clips', {
      data: { name: 'Saved style second clip', start_ms: 4000, end_ms: 7000 },
    })
  ).json();
  await page.goto('/studio/' + second.id);
  await page.getByRole('tab', { name: 'Captions', exact: true }).click();
  await page.getByRole('button', { name: 'Saved styles', exact: true }).click();
  await gallery.getByRole('button', { name: 'Interview browser style', exact: true }).click();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const styled = await (await request.get('/api/v1/clips/' + second.id)).json();
  expect(styled.document.captions.preset).toBe('reveal');
  expect(styled.document.captions.position_y).toBe(second.document.captions.position_y);
  await gallery
    .getByRole('button', { name: 'Remove saved style: Interview browser style', exact: true })
    .click();
  await expect(
    page.getByText('Save your current styling to reuse it in another clip.'),
  ).toBeVisible();
  const retained = await (await request.get('/api/v1/clips/' + second.id)).json();
  expect(retained.document.captions).toEqual(styled.document.captions);

  await page.goto('/studio/' + first.id);
  await page.getByRole('tab', { name: 'Source segments', exact: true }).click();
  const panel = page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: 'Clip potential' }) });
  await panel.locator('summary').click();
  await expect(panel.getByText('This edit has not been rated yet.')).toBeVisible();
  const rate = panel.getByRole('button', { name: 'Rate clip potential', exact: true });
  await rate.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => ratingRequests).toBe(1);
  await expect(panel.getByRole('button', { name: 'Processing', exact: true })).toBeDisabled();
  finishRating?.();
  await expect(rate).toBeEnabled();
  await page.reload();
  await page.getByRole('tab', { name: 'Source segments', exact: true }).click();
  await panel.locator('summary').click();
  await expect(panel.getByRole('meter')).toHaveCount(4);
  await expect(panel.getByRole('status', { name: 'Clip potential' })).toHaveText('80/100');
  await page.getByLabel('Clip name', { exact: true }).fill('Caption library edited fixture');
  await expect(
    panel.getByText('This rating is for a previous edit. Rate the saved clip again.'),
  ).toBeVisible();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  failRating = true;
  await rate.click();
  await expect(panel.getByRole('alert')).toHaveText('Controlled rating failure');
  await expect(rate).toBeEnabled();
  await page.route('**/api/v1/jobs', async (route) => {
    const response = await route.fetch();
    const jobs: Job[] = await response.json();
    await route.fulfill({
      json: [
        ...jobs,
        {
          id: 'failed-rating-worker-fixture',
          kind: 'assess',
          status: 'failed',
          stage: 'rating',
          progress: 0.15,
          message: 'Controlled worker failure',
          error: 'Controlled worker failure',
          clip_id: first.id,
          created_at: Date.now() + 1000,
          updated_at: Date.now() + 1000,
          payload: {},
        },
      ],
    });
  });
  modelReady = false;
  await page.reload();
  await page
    .getByRole('complementary', { name: 'Progress and alerts', exact: true })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Source segments', exact: true }).click();
  await panel.locator('summary').click();
  await expect(rate).toBeDisabled();
  await expect(panel.getByRole('alert')).toHaveText('Controlled worker failure');
  await expect(
    panel.getByText('Install Qwen3 4B in Settings to rate this clip locally.'),
  ).toBeVisible();
  expect(
    (await (await request.get('/api/v1/clips/' + first.id)).json()).document.words[0].text,
  ).toBe('LOCAL');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Captions', exact: true }).click();
  await page.getByRole('button', { name: 'All styles', exact: true }).click();
  await expect(gallery.getByRole('button')).toHaveCount(18);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const sidebar = page.locator('aside').filter({ has: page.getByRole('navigation') });
  expect(await sidebar.innerText()).not.toContain('Processing stays on your PC');
  expect(await sidebar.innerText()).not.toContain('UnlimitedClipper');
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    ),
  ).toBe('#ffb86b');
  await page.screenshot({ path: 'test-results/caption-library-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
