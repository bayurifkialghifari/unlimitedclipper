import { test, expect } from '@playwright/test';
import path from 'node:path';
import type { Export, Job, Project } from '../../apps/studio/src/types';

test('uses the window width, keeps long jobs readable, and plays a real export on demand', async ({
  page,
  request,
}) => {
  const settings = await (await request.get('/api/v1/settings')).json();
  await request.put('/api/v1/settings', { data: { ...settings, language: 'en' } });
  const project: Project = {
    id: 'layout-project',
    name: 'Layout fixture',
    asset_id: 'layout-source',
    created_at: Date.now(),
    duration_ms: 10400,
    has_audio: true,
    width: 720,
    height: 1280,
    source_kind: 'file',
    words: [],
  };
  const job: Job = {
    id: 'layout-job',
    kind: 'export',
    status: 'failed',
    stage: 'render',
    progress: 0.42,
    message: 'Rendering fixture',
    payload: {},
    created_at: Date.now() - 60000,
    updated_at: Date.now() - 60000,
    error: 'Long processing path: ' + 'abcdefghij'.repeat(150),
  };
  const exported: Export = {
    id: 'layout-export',
    name: 'Real export fixture.mp4',
    asset_id: 'layout-video',
    srt_asset_id: 'layout-captions',
    ass_asset_id: 'layout-ass',
    clip_id: 'layout-clip',
    project_id: project.id,
    created_at: Date.now(),
    revision: 3,
  };
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: [project] }));
  await page.route('**/api/v1/jobs', (route) => route.fulfill({ json: [job] }));
  await page.route('**/api/v1/exports', (route) => route.fulfill({ json: [exported] }));
  let videoRequests = 0;
  await page.route('**/api/v1/assets/layout-video', (route) => {
    videoRequests += 1;
    return route.fulfill({ path: path.resolve('docs/media/escape.mp4'), contentType: 'video/mp4' });
  });
  await page.route('**/api/v1/assets/layout-captions', (route) =>
    route.fulfill({
      path: path.resolve('docs/media/escape.srt'),
      contentType: 'text/plain',
    }),
  );
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of ['/projects', '/exports', '/jobs', '/settings']) {
      await page.goto(route);
      await expect(page.locator('[data-page-header]')).toBeVisible();
      if (route === '/projects') {
        await expect(page.getByRole('heading', { name: project.name })).toBeVisible();
        const search = page.getByRole('searchbox', { name: 'Search projects' });
        await search.fill('Layout');
        const bounds = await search.boundingBox();
        expect(bounds).not.toBeNull();
        expect(viewport.width - bounds!.x - bounds!.width).toBeLessThanOrEqual(25);
      }
      if (route === '/jobs') {
        await page.getByText('Error details', { exact: true }).click();
        await expect(page.getByText(job.error!, { exact: true })).toBeVisible();
        await expect(page.locator('main').getByText('42%', { exact: true })).toBeVisible();
      }
      if (route === '/settings') {
        await expect(
          page.getByRole('button', { name: 'Save preferences' }).locator('svg'),
        ).toHaveCount(1);
        await expect(
          page.getByRole('button', { name: 'Check for updates' }).locator('svg'),
        ).toHaveCount(1);
      }
      const metrics = await page.locator('main').evaluate((main) => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        right: main.lastElementChild?.getBoundingClientRect().right,
      }));
      expect(metrics.overflow).toBe(false);
      if (route !== '/settings') {
        expect(viewport.width - metrics.right!).toBeLessThanOrEqual(25);
      }
    }
  }
  await page.goto('/exports');
  await expect(page.getByRole('heading', { name: exported.name })).toBeVisible();
  expect(videoRequests).toBe(0);
  await page.getByText('Preview video', { exact: true }).click();
  const video = page.getByLabel(exported.name, { exact: true });
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: 'test-results/layout-export.png', fullPage: true });
});
