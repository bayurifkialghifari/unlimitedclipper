import { test, expect } from '@playwright/test';
import type { Job, ModelStatus } from '../../apps/studio/src/types';

function fixtureJob(id: string, kind: string, payload: unknown): Job {
  return {
    id,
    kind,
    payload,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    message: 'Queued fixture',
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

test.beforeEach(async ({ request }) => {
  const settings = await (await request.get('/api/v1/settings')).json();
  await request.put('/api/v1/settings', {
    data: { ...settings, language: 'en', auto_update: false, component_feed: '', update_feed: '' },
  });
});

test('shows submission, download, clip stages, cancellation, and terminal alerts across pages', async ({
  page,
}) => {
  let jobs: Job[] = [];
  let admit: () => void = () => {};
  const admission = new Promise<void>((resolve) => {
    admit = resolve;
  });
  await page.route('**/api/v1/jobs', (route) => route.fulfill({ json: jobs }));
  await page.route('**/api/v1/imports/youtube', async (route) => {
    await admission;
    jobs = [fixtureJob('import-fixture', 'youtube', { name: 'Import fixture' })];
    await route.fulfill({ json: jobs[0] });
  });
  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'Paste a YouTube video link' })
    .fill('https://www.youtube.com/watch?v=fixture');
  await page.getByRole('button', { name: 'Import video', exact: true }).click();
  const popup = page.getByRole('complementary', { name: 'Progress and alerts' });
  await expect(popup.getByText('Preparing the video import')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import video', exact: true })).toBeDisabled();
  admit();
  const source = popup.getByRole('region', { name: 'Import fixture' });
  await expect(source.getByText('0%', { exact: true })).toBeVisible();
  jobs[0] = {
    ...jobs[0],
    status: 'running',
    stage: 'download',
    progress: 0.32,
    updated_at: Date.now(),
  };
  await expect(source.getByText('Downloading', { exact: true })).toBeVisible();
  await expect(source.getByText('32%', { exact: true })).toBeVisible();
  jobs[0] = { ...jobs[0], stage: 'proxy', progress: 0.75, updated_at: Date.now() };
  await expect(source.getByText('Preparing the studio preview')).toBeVisible();
  await expect(source.getByRole('progressbar')).toHaveAttribute('value', '0.75');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(source).toBeVisible();
  jobs[0] = { ...jobs[0], status: 'completed', progress: 1, updated_at: Date.now() };
  await expect(source.getByText('Completed', { exact: true })).toBeVisible();
  await source.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(source).toHaveCount(0);

  jobs = [fixtureJob('clip-fixture', 'generate', { name: 'Clip fixture' })];
  jobs[0] = { ...jobs[0], status: 'running', stage: 'transcription', progress: 0.2 };
  const clip = popup.getByRole('region', { name: 'Clip fixture' });
  await expect(clip.getByText('Transcribing locally')).toBeVisible();
  jobs[0] = { ...jobs[0], kind: 'export', stage: 'render', progress: 0.6, updated_at: Date.now() };
  await expect(clip.getByText('Rendering the saved clip')).toBeVisible();
  await expect(clip.getByText('60%', { exact: true })).toBeVisible();
  await page.route('**/api/v1/jobs/clip-fixture/cancel', async (route) => {
    jobs[0] = { ...jobs[0], status: 'cancelling', updated_at: Date.now() };
    await route.fulfill({ json: jobs[0] });
  });
  await clip.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(clip.getByRole('button', { name: 'Stopping', exact: true })).toBeDisabled();
  jobs[0] = { ...jobs[0], status: 'cancelled', updated_at: Date.now() };
  await expect(clip.getByText('Cancelled', { exact: true })).toBeVisible();
  jobs[0] = {
    ...jobs[0],
    status: 'failed',
    error: 'Controlled processing failure',
    updated_at: Date.now(),
  };
  await expect(clip.getByRole('alert')).toHaveText('Controlled processing failure');
  await expect(popup.getByRole('button', { name: /Minimize|Show progress/ })).toHaveCount(0);
  await expect(clip).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: 'test-results/onboarding-progress.png', fullPage: true });
});

test('downloads the selected model, retains manual import, and offers simple preview updates', async ({
  page,
  request,
  context,
}) => {
  let models: ModelStatus[] = (await (await request.get('/api/v1/models')).json()).map(
    (model: ModelStatus) => ({
      ...model,
      ready: false,
      downloaded_bytes: 0,
    }),
  );
  let jobs: Job[] = [];
  await page.route('**/api/v1/models', (route) => route.fulfill({ json: models }));
  await page.route('**/api/v1/jobs', (route) => route.fulfill({ json: jobs }));
  await page.route('**/api/v1/models/whisper-medium/download', async (route) => {
    jobs = [fixtureJob('model-fixture', 'model', { model_id: 'whisper-medium' })];
    await route.fulfill({ json: jobs[0] });
  });
  await page.goto('/settings');
  const setup = page.getByRole('region', { name: 'Local AI models', exact: true });
  await setup.getByRole('combobox', { name: 'Choose an AI model' }).selectOption('whisper-medium');
  const download = page.waitForRequest('**/api/v1/models/whisper-medium/download');
  await setup.getByRole('button', { name: 'Download model', exact: true }).click();
  expect((await download).method()).toBe('POST');
  const popup = page.getByRole('complementary', { name: 'Progress and alerts' });
  await expect(popup.getByRole('region', { name: 'Whisper medium Q5_0' })).toBeVisible();
  models = models.map((model) =>
    model.id === 'whisper-medium' ? { ...model, ready: true, downloaded_bytes: model.size } : model,
  );
  jobs[0] = {
    ...jobs[0],
    status: 'completed',
    stage: 'verify',
    progress: 1,
    updated_at: Date.now(),
  };
  await expect(setup.getByRole('button', { name: 'Model installed', exact: true })).toBeDisabled();
  await page.route('**/api/v1/models/whisper-medium/import', (route) =>
    route.fulfill({ json: models[1] }),
  );
  await setup.getByText('Import a model file manually', { exact: true }).click();
  const imported = page.waitForRequest('**/api/v1/models/whisper-medium/import');
  await setup.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'controlled-model.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('controlled fixture'),
  });
  expect((await imported).method()).toBe('POST');
  await expect(popup.getByText('Model installed', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Application update feed' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Toolchain update feed' })).toHaveCount(0);
  await expect(
    page.getByRole('checkbox', { name: 'Update automatically', exact: true }),
  ).toBeDisabled();
  await context.route('https://github.com/bayurifkialghifari/unlimitedclipper/releases', (route) =>
    route.fulfill({ body: '<h1>Release page fixture</h1>', contentType: 'text/html' }),
  );
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  const downloadPage = await opened;
  await downloadPage.waitForLoadState();
  expect(downloadPage.url()).toBe(
    'https://github.com/bayurifkialghifari/unlimitedclipper/releases',
  );
  await downloadPage.close();
  await page.screenshot({ path: 'test-results/onboarding-settings.png', fullPage: true });
});

test('keeps preview downloads accessible after refreshing an older native host', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const host = window as typeof window & {
      isTauri: boolean;
      __TAURI_INTERNALS__: { invoke: (command: string) => Promise<void> };
      nativeCommands: string[];
    };
    host.isTauri = true;
    host.nativeCommands = [];
    host.__TAURI_INTERNALS__ = {
      invoke: async (command) => {
        host.nativeCommands.push(command);
        if (command === 'open_release_page') {
          throw 'Command open_release_page not found';
        }
      },
    };
  });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(
    page.getByText('The browser studio is open. Use Check for updates there to open downloads.'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as typeof window & { nativeCommands: string[] }).nativeCommands,
    ),
  ).toEqual(['open_release_page', 'open_browser']);
});
