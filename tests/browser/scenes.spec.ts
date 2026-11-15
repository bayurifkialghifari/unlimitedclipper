import { test, expect } from '@playwright/test';
import path from 'node:path';
import type { Clip, ProjectDetail } from '../../apps/studio/src/types';
import { openTranscript } from './helpers';

test('reorders real scenes, trims once per gesture, cuts transcript ranges, and protects stale previews', async ({
  page,
  request,
}) => {
  const settings = await (await request.get('/api/v1/settings')).json();
  await request.put('/api/v1/settings', {
    data: { ...settings, language: 'en', auto_update: false },
  });
  const imported = await (
    await request.post('/api/v1/imports/local', {
      data: { path: path.resolve('.cache/fixtures/scene-order.mp4') },
    })
  ).json();
  let projectId = '';
  await expect
    .poll(async () => {
      const job = (await (await request.get('/api/v1/jobs')).json()).find(
        (job: { id: string }) => job.id === imported.id,
      );
      projectId = job.project_id;
      return job.status;
    })
    .toBe('completed');
  let clip: Clip = await (
    await request.post('/api/v1/projects/' + projectId + '/clips', {
      data: { name: 'Visual scene fixture', start_ms: 0, end_ms: 3000 },
    })
  ).json();
  clip.document.version = 3;
  clip.document.resolution = 720;
  clip.document.segments = ['red', 'green', 'blue'].map((id, index) => ({
    id,
    start_ms: index * 1000,
    end_ms: (index + 1) * 1000,
  }));
  clip.document.words = ['RED', 'GREEN', 'BLUE'].map((text, index) => ({
    id: 'word-' + index,
    text,
    start_ms: index * 1000 + 100,
    end_ms: index * 1000 + 500,
    emphasis: false,
  }));
  const importedProject: ProjectDetail = await (
    await request.get('/api/v1/projects/' + projectId)
  ).json();
  clip.document.audio_layers = [
    {
      id: 'source-audio',
      enabled: true,
      start_ms: 100,
      end_ms: 600,
      asset_id: importedProject.project.asset_id,
      source_start_ms: 1000,
      gain: 0.1,
    },
  ];
  clip = await (await request.put('/api/v1/clips/' + clip.id, { data: clip })).json();
  await page.addInitScript((id) => localStorage.setItem('uc-project', id), projectId);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let remaps = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/timeline-preview')) {
      remaps += 1;
    }
  });
  async function saved() {
    const project: ProjectDetail = await (
      await request.get('/api/v1/projects/' + projectId)
    ).json();
    return project.clips.find((item) => item.id === clip.id)!;
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/studio/' + clip.id);
  const timeline = page.getByRole('region', { name: 'Timeline', exact: true });
  await expect(timeline).toBeVisible();
  const blue = timeline.getByRole('button', { name: 'Move layer · Scene 3', exact: true });
  const red = timeline.getByRole('button', { name: 'Move layer · Scene 1', exact: true });
  const from = await blue.boundingBox();
  const to = await red.boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + 20);
  await page.mouse.down();
  await page.mouse.move(to!.x + 10, to!.y + 20, { steps: 12 });
  expect(remaps).toBe(0);
  await page.mouse.up();
  await expect
    .poll(async () => (await saved()).document.segments?.map((scene) => scene.id))
    .toEqual(['blue', 'red', 'green']);
  expect(remaps).toBe(1);
  const source = page.getByRole('region', { name: 'Preview video', exact: true });
  const video = source.locator('video').first();
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(1);
  await timeline.getByRole('button', { name: 'Video playhead', exact: true }).focus();
  await openTranscript(page);
  const transcript = page.getByRole('region', { name: 'Transcript', exact: true });
  await transcript.getByRole('button', { name: 'BLUE', exact: true }).click();
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBeGreaterThan(2);
  await source.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBeLessThan(1);
  await source.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(async () => (await saved()).document.segments?.map((scene) => scene.id))
    .toEqual(['red', 'green', 'blue']);
  await timeline.getByRole('button', { name: 'Trim start · Audio layers', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await saved()).document.audio_layers?.[0].source_start_ms)
    .toBe(1100);
  await timeline.getByRole('button', { name: 'Move layer · Audio layers', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await saved()).document.audio_layers?.[0].start_ms).toBe(300);
  expect((await saved()).document.audio_layers?.[0].source_start_ms).toBe(1100);
  await timeline.getByRole('button', { name: 'Trim start · Scene 1', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await saved()).document.segments?.[0].start_ms).toBe(100);
  const beforeCancel = remaps;
  const trim = await timeline
    .getByRole('button', { name: 'Trim end · Scene 3', exact: true })
    .boundingBox();
  await page.mouse.move(trim!.x + 4, trim!.y + 20);
  await page.mouse.down();
  await page.mouse.move(trim!.x - 100, trim!.y + 20);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(remaps).toBe(beforeCancel);
  await openTranscript(page);
  await transcript.getByRole('button', { name: 'GREEN', exact: true }).click();
  await transcript.getByRole('button', { name: 'Remove caption text', exact: true }).click();
  await expect
    .poll(async () => (await saved()).document.words.map((word) => word.text))
    .toEqual(['RED', 'BLUE']);
  expect((await saved()).document.segments).toHaveLength(3);
  await transcript.getByRole('button', { name: 'BLUE', exact: true }).click();
  await transcript.getByRole('button', { name: 'Cut from video', exact: true }).click();
  await expect.poll(async () => (await saved()).document.segments?.length).toBe(4);
  await page.getByRole('button', { name: 'Render edited preview', exact: true }).click();
  await page.getByRole('button', { name: 'Edited', exact: true }).waitFor();
  const composed = page.getByRole('region', { name: 'Preview video', exact: true });
  await expect.poll(() => composed.locator('video').count()).toBe(1);
  await expect
    .poll(() =>
      composed.locator('video').evaluate((element) => (element as HTMLVideoElement).readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await timeline.getByRole('button', { name: 'Move layer · Scene 1', exact: true }).click();
  await page.getByRole('button', { name: 'Move later', exact: true }).click();
  await expect(
    page.getByText('Video edits changed. Refresh the preview to review the current edit.'),
  ).toBeVisible();
  await expect(composed.locator('video')).not.toHaveAttribute('controls', '');
  for (const viewport of [
    { width: 2560, height: 1440 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    if (viewport.width > 1100) {
      const bounds = await timeline.boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    }
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: 'Live preview', exact: true }).click();
  await page.screenshot({ path: 'test-results/visual-editor.png', fullPage: true });
  expect(errors).toEqual([]);
});
