import { expect, test, type Locator } from '@playwright/test';
import path from 'node:path';

async function dropOnTrack(source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  expect(bounds).not.toBeNull();
  await source.dragTo(target, {
    targetPosition: {
      x: Math.min(220, bounds!.width / 3),
      y: bounds!.height / 2,
    },
  });
}

test('places filter, B-roll, and imported sound by dragging to their timeline tracks', async ({
  page,
  request,
}) => {
  const settings = await (await request.get('/api/v1/settings')).json();
  await request.put('/api/v1/settings', {
    data: { ...settings, language: 'en', auto_update: false },
  });
  const imported = await (
    await request.post('/api/v1/imports/local', {
      data: { path: path.resolve('.cache/fixtures/speech-face.mp4') },
    })
  ).json();
  let projectId = '';
  await expect
    .poll(async () => {
      const job = (await (await request.get('/api/v1/jobs')).json()).find(
        (candidate: { id: string }) => candidate.id === imported.id,
      );
      projectId = job.project_id;
      return job.status;
    })
    .toBe('completed');
  const clip = await (
    await request.post('/api/v1/projects/' + projectId + '/clips', {
      data: { name: 'Timeline media placement', start_ms: 0, end_ms: 4000 },
    })
  ).json();
  async function saved() {
    const response = await request.get('/api/v1/clips/' + clip.id);
    return response.json();
  }
  const errors: string[] = [];
  page.on('pageerror', (failure) => errors.push(failure.message));
  await page.setViewportSize({ width: 1920, height: 1440 });
  await page.goto('/studio/' + clip.id);
  const timeline = page.getByRole('region', { name: 'Timeline', exact: true });

  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await dropOnTrack(
    page.getByRole('button', { name: 'Warm', exact: true }),
    timeline.locator('[data-kind="filter"]'),
  );
  await expect
    .poll(async () => {
      const clip = await saved();
      return clip.document.filter_layers?.[0]?.adjustments.warmth;
    })
    .toBe(30);

  await page.getByRole('tab', { name: 'B-roll', exact: true }).click();
  await dropOnTrack(
    page.getByRole('region', { name: 'B-roll library' }).locator('[draggable="true"]').first(),
    timeline.locator('[data-kind="broll"]'),
  );
  await expect
    .poll(async () => {
      const clip = await saved();
      return clip.document.visual_layers?.some((layer: { kind: string }) => layer.kind === 'broll');
    })
    .toBe(true);

  await page.getByRole('tab', { name: 'Audio layers', exact: true }).click();
  const audioPanel = page.getByRole('tabpanel', { name: 'Audio layers', exact: true });
  const importedSounds = audioPanel.locator('[draggable="true"]').filter({ hasText: 'jfk.wav' });
  const soundCount = await importedSounds.count();
  await audioPanel
    .getByLabel('Import local audio')
    .setInputFiles(path.resolve('.cache/fixtures/jfk.wav'));
  await expect(importedSounds).toHaveCount(soundCount + 1);
  const sound = importedSounds.last();
  await expect(sound).toBeVisible();
  await dropOnTrack(sound, timeline.locator('[data-kind="audio"]').last());
  await expect
    .poll(async () => {
      const clip = await saved();
      return clip.document.audio_layers?.length;
    })
    .toBe(1);
  expect(errors).toEqual([]);
});
