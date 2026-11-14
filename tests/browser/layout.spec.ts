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
  const jobs: Job[] = [
    job,
    {
      ...job,
      id: 'layout-cancelled',
      kind: 'model',
      status: 'cancelled',
      progress: 0,
      error: undefined,
    },
    {
      ...job,
      id: 'layout-completed',
      kind: 'generate',
      status: 'completed',
      progress: 1,
      payload: { qualifying_moments: 0 },
      error: undefined,
    },
    { ...job, id: 'layout-tracking', kind: 'track', progress: 0, error: undefined },
    {
      ...job,
      id: 'layout-running',
      kind: 'import',
      status: 'running',
      progress: 0.64,
      error: undefined,
    },
  ];
  let retryRequests = 0;
  let finishRetry: (() => void) | undefined;
  await page.route('**/api/v1/jobs/layout-job/retry', async (route) => {
    retryRequests += 1;
    await new Promise<void>((resolve) => {
      finishRetry = resolve;
    });
    await route.fulfill({ json: { ...job, status: 'queued' } });
  });
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: [project] }));
  await page.route('**/api/v1/jobs', (route) => route.fulfill({ json: jobs }));
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
        const rows = page.locator('main article');
        await expect(rows).toHaveCount(jobs.length);
        if (viewport.width >= 1280) {
          const geometry = await rows.evaluateAll((rows) =>
            rows.map((row) => {
              const title = row.querySelector('h2')!.getBoundingClientRect();
              const meter = row.querySelector('progress')!.getBoundingClientRect();
              return {
                left: meter.left,
                width: meter.width,
                titleCenter: title.top + title.height / 2,
                meterCenter: meter.top + meter.height / 2,
              };
            }),
          );
          for (const bounds of geometry) {
            expect(Math.abs(bounds.left - geometry[0].left)).toBeLessThan(1);
            expect(Math.abs(bounds.width - geometry[0].width)).toBeLessThan(1);
            expect(Math.abs(bounds.titleCenter - bounds.meterCenter)).toBeLessThan(1);
          }
        }
        const retry = rows.first().getByRole('button', { name: 'Retry', exact: true });
        await expect(retry).toHaveText('');
        await expect(retry).toHaveAttribute('title', 'Retry');
        await expect(retry.locator('svg')).toHaveCount(1);
        const retryBounds = await retry.boundingBox();
        expect(retryBounds!.width).toBe(44);
        expect(retryBounds!.height).toBe(44);
        if (viewport.width === 1920) {
          await retry.focus();
          await page.keyboard.press('Enter');
          await expect.poll(() => retryRequests).toBe(1);
          await expect(retry).toBeDisabled();
          finishRetry!();
          await expect(retry).toBeEnabled();
          await page.screenshot({ path: 'test-results/layout-jobs.png', fullPage: true });
        }
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
  await page.getByRole('button', { name: /Progress and alerts.*Minimize/ }).click();
  expect(videoRequests).toBe(0);
  await page.getByText('Preview video', { exact: true }).click();
  const video = page.getByLabel(exported.name, { exact: true });
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: 'test-results/layout-export.png', fullPage: true });
});
