import { test, expect } from '@playwright/test';
import path from 'node:path';
import { createManualClip } from './helpers';

test('shows source frames, switches clips, and exposes the gaming split layout', async ({
  page,
  request,
}) => {
  const settings = await (await request.get('/api/v1/settings')).json();
  await request.put('/api/v1/settings', {
    data: { ...settings, language: 'en', auto_update: false },
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const existingProjects = await (await request.get('/api/v1/projects')).json();
  const matchingProjects = existingProjects.filter(
    (project: { name: string }) => project.name === 'speech-face.mp4',
  ).length;
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(path.resolve('.cache/fixtures/speech-face.mp4'));
  await expect(page.getByRole('heading', { name: 'speech-face.mp4', exact: true })).toHaveCount(
    matchingProjects + 1,
    { timeout: 120_000 },
  );
  await createManualClip(page, 'First scene', 1, 4);

  const timeline = page.getByRole('region', { name: 'Timeline', exact: true });
  await expect(timeline).toBeVisible();
  await expect(timeline.getByText('Scenes', { exact: true })).toBeVisible();
  await expect(timeline.getByText('No words. Add in Captions.')).toBeVisible();
  await expect.poll(() => timeline.locator('img').count(), { timeout: 90000 }).toBeGreaterThan(0);
  await expect
    .poll(() =>
      timeline
        .locator('img')
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole('region', { name: 'Processing', exact: true })).toHaveCount(0);
  const ruler = timeline.getByRole('slider', { name: 'Playhead' });
  await ruler.focus();
  await page.keyboard.press('End');
  await expect(ruler).toHaveAttribute('aria-valuenow', '3000');
  await page.getByRole('button', { name: 'Add caption word' }).click();
  await page.getByRole('tabpanel').getByLabel('Text', { exact: true }).fill('LOCAL');
  const word = timeline.getByRole('button', { name: /LOCAL/ });
  await word.click();
  await expect(word).toHaveAttribute('aria-pressed', 'true');
  await expect(word).toHaveAttribute('data-active', 'true');

  await page.getByRole('combobox', { name: 'Composition' }).first().selectOption('gaming');
  await page.getByRole('tab', { name: 'Crop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gaming split', exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'Facecam sits above gameplay. Use Auto-detect facecam, then review both regions.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Auto-detect facecam' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Facecam region' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gameplay region' })).toBeVisible();
  const gaming = page.getByRole('region', { name: 'Gaming split' });
  await gaming.getByLabel('Left (%)').first().fill('0');
  await gaming.getByLabel('Top (%)').first().fill('0');
  await gaming.getByLabel('Width (%)').first().fill('100');
  await gaming.getByLabel('Height (%)').first().fill('100');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const firstClipId = new URL(page.url()).pathname.split('/').at(-1)!;
  const beforeTracking = await (await request.get('/api/v1/clips/' + firstClipId)).json();
  await page.getByRole('button', { name: 'Auto-detect facecam' }).click();
  await expect
    .poll(
      async () => {
        const jobs = await (await request.get('/api/v1/jobs')).json();
        const job = jobs.find(
          (job: { kind: string; clip_id: string }) =>
            job.kind === 'track' && job.clip_id === firstClipId,
        );
        if (job?.status === 'failed') {
          throw new Error(job.error ?? 'Facecam detection failed.');
        }
        return job?.status;
      },
      { timeout: 90_000 },
    )
    .toBe('completed');
  const tracked = await (await request.get('/api/v1/clips/' + firstClipId)).json();
  expect(tracked.document.layout).toBe('gaming');
  expect(tracked.document.gameplay_crop).toEqual(beforeTracking.document.gameplay_crop);
  await expect(page.getByRole('combobox', { name: 'Composition' }).first()).toHaveValue('gaming');
  await expect(page.getByRole('complementary', { name: 'Progress and alerts' })).toHaveCount(0);
  await page.getByRole('heading', { name: 'Gaming split', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/timeline-gaming.png', fullPage: true });

  await page.getByRole('button', { name: 'Clips', exact: true }).click();
  await page.getByRole('button', { name: 'Create a clip', exact: true }).click();
  await page.getByLabel('Clip name', { exact: true }).fill('Second scene');
  await page.getByLabel('Source start (seconds)', { exact: true }).fill('5');
  await page.getByLabel('Source end (seconds)', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Edit clip', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Second scene', exact: true })).toBeVisible();
  const rail = page.getByRole('region', { name: 'Clips', exact: true });
  await expect(rail.getByRole('button')).toHaveCount(2);
  await rail.getByRole('button', { name: /First scene/ }).click();
  await expect(page.getByRole('heading', { name: 'First scene', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Composition' }).first()).toHaveValue('gaming');

  const activeId = new URL(page.url()).pathname.split('/').at(-1)!;
  const active = await (await request.get('/api/v1/clips/' + activeId)).json();
  for (let number = 3; number <= 19; number += 1) {
    const response = await request.post('/api/v1/projects/' + active.project_id + '/clips', {
      data: { name: 'Rail clip ' + number, start_ms: 0, end_ms: 1000 },
    });
    expect(response.ok()).toBe(true);
  }
  await expect(rail.getByRole('button')).toHaveCount(19);
  const last = rail.getByRole('button', { name: /Rail clip 19/ });
  await last.focus();
  await expect(last).toBeFocused();
  await last.click();
  await expect(page.getByRole('heading', { name: 'Rail clip 19', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Progress and alerts' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/timeline-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const timelineTop = (await timeline.boundingBox())!.y;
  const inspectorTop = (await page.getByRole('tablist').boundingBox())!.y;
  expect(inspectorTop).toBeLessThan(timelineTop);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: 'test-results/timeline-narrow.png', fullPage: true });
  expect(errors).toEqual([]);
});
