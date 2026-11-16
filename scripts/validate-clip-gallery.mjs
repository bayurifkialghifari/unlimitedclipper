import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { testEngine } from './test-engine.mjs';
import { root } from './cargo.mjs';

const engine = await testEngine(43212);
const browser = await chromium.launch({ headless: true });
const errors = [];

try {
  const settings = await engine.api('/settings');
  await engine.api('/settings', { ...settings, language: 'en' }, 'PUT');
  await engine.wait(
    await engine.api('/imports/local', {
      path: path.join(root, '.cache/fixtures/speech-face.mp4'),
    }),
  );
  const project = (await engine.api('/projects'))[0];
  assert.ok(project);
  const first = await engine.api('/projects/' + project.id + '/clips', {
    name: 'Opening moment',
    start_ms: 0,
    end_ms: 3000,
  });
  const second = await engine.api('/projects/' + project.id + '/clips', {
    name: 'Later moment',
    start_ms: 4000,
    end_ms: 7000,
  });
  first.document.title.text = 'FIRST MOMENT';
  first.document.title.duration_ms = 2000;
  const saved = await engine.api(
    '/clips/' + first.id,
    {
      revision: first.revision,
      name: first.name,
      document: first.document,
    },
    'PUT',
  );
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(engine.origin + '/projects/' + project.id);
  const cards = page.locator('article[data-clip-id]');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByRole('heading', { name: first.name })).toBeVisible();
  await expect(cards.nth(1).getByRole('heading', { name: second.name })).toBeVisible();
  await expect.poll(async () => cards.locator('img').count(), { timeout: 60_000 }).toBe(2);
  const frameIds = await cards
    .locator('img')
    .evaluateAll((images) => images.map((image) => new URL(image.src).pathname));
  assert.notEqual(frameIds[0], frameIds[1], 'Each clip must use its own source frame.');
  await expect
    .poll(async () =>
      cards.locator('img').evaluateAll((images) => images.every((image) => image.naturalWidth > 0)),
    )
    .toBe(true);
  await page.screenshot({ path: path.join(root, '.cache/clip-gallery-browser.png') });

  await cards
    .nth(0)
    .getByRole('button', { name: 'Play edited clip: ' + first.name })
    .click();
  const dialog = page.getByRole('dialog', { name: first.name });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Revision ' + saved.revision)).toBeVisible();
  const video = dialog.locator('video');
  await expect(video).toBeVisible({ timeout: 120_000 });
  await expect
    .poll(async () => video.evaluate((element) => element.readyState >= 2), { timeout: 30_000 })
    .toBe(true);
  await video.evaluate(async (element) => {
    element.muted = true;
    await element.play();
  });
  await expect
    .poll(async () => video.evaluate((element) => element.currentTime), { timeout: 15_000 })
    .toBeGreaterThan(0.25);
  await page.screenshot({ path: path.join(root, '.cache/clip-review-browser.png') });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).not.toBeVisible();

  const previewRoute = '**/api/v1/clips/' + second.id + '/preview-render';
  await page.route(previewRoute, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Validation render outage' }),
    }),
  );
  const secondPlay = cards.nth(1).getByRole('button', {
    name: 'Play edited clip: ' + second.name,
  });
  await secondPlay.focus();
  await page.keyboard.press('Enter');
  const secondDialog = page.getByRole('dialog', { name: second.name });
  await expect(secondDialog.getByRole('alert')).toContainText('Validation render outage');
  await page.unroute(previewRoute);
  await secondDialog.getByRole('button', { name: 'Retry' }).click();
  await expect(secondDialog.locator('video')).toBeVisible({ timeout: 120_000 });
  await page.keyboard.press('Escape');
  await expect(secondDialog).not.toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(cards).toHaveCount(2);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  assert.equal(overflow, false, 'The narrow gallery must not overflow horizontally.');
  await cards
    .nth(0)
    .getByRole('button', { name: 'Play edited clip: ' + first.name })
    .click();
  const narrowDialog = page.getByRole('dialog', { name: first.name });
  await expect(narrowDialog).toBeVisible();
  const dialogFits = await narrowDialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= window.innerWidth;
  });
  assert.equal(dialogFits, true, 'The narrow preview dialog must fit the viewport.');
  await page.keyboard.press('Escape');
  await expect(narrowDialog).not.toBeVisible();
  const preferences = await engine.api('/settings');
  await engine.api('/settings', { ...preferences, language: 'id' }, 'PUT');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Putar hasil edit: ' + first.name })).toBeVisible();
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(root, '.cache/clip-gallery-validation.json'),
    JSON.stringify(
      {
        project_id: project.id,
        clip_ids: [saved.id, second.id],
        frame_assets: frameIds,
        rendered_revision: saved.revision,
        browser_playback: true,
        error_retry: true,
        keyboard_escape: true,
        indonesian_controls: true,
        narrow_overflow: overflow,
        narrow_dialog_fits: dialogFits,
        page_errors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await engine.stop();
}
