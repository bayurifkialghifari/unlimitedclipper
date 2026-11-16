import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { testEngine } from './test-engine.mjs';
import { root } from './cargo.mjs';

const engine = await testEngine(43196);
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  await engine.wait(
    await engine.api('/imports/local', {
      path: path.join(root, '.cache/fixtures/speech-face.mp4'),
    }),
  );
  const project = (await engine.api('/projects'))[0];
  const clip = await engine.api('/projects/' + project.id + '/clips', {
    name: 'Composed preview fixture',
    start_ms: 1000,
    end_ms: 5000,
  });
  clip.document.title.text = 'LOCAL PREVIEW';
  clip.document.title.duration_ms = 3000;
  clip.document.words = [
    {
      id: 'preview-word',
      text: 'VISIBLE',
      start_ms: 0,
      end_ms: 3000,
      confidence: 1,
      emphasis: false,
      color: null,
    },
  ];
  const saved = await engine.api(
    '/clips/' + clip.id,
    {
      revision: clip.revision,
      name: clip.name,
      document: clip.document,
    },
    'PUT',
  );
  const plan = await engine.api('/clips/' + saved.id + '/preview-plan', {
    revision: saved.revision,
    document: saved.document,
  });
  assert.ok(plan.graphics.includes('VISIBLE'));
  const conflict = await fetch(engine.origin + '/api/v1/clips/' + saved.id + '/preview-plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revision: saved.revision - 1, document: saved.document }),
  });
  assert.equal(conflict.status, 409);
  const invalid = structuredClone(saved.document);
  invalid.watermark.mode = 'image';
  invalid.watermark.asset_id = project.asset_id;
  const rejected = await fetch(engine.origin + '/api/v1/clips/' + saved.id + '/preview-plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ revision: saved.revision, document: invalid }),
  });
  assert.equal(rejected.status, 400, 'A registered video cannot be treated as an image watermark.');
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      process.stderr.write(response.status() + ' ' + response.url() + '\n');
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto(engine.origin + '/studio/' + saved.id);
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('canvas');
      if (!canvas) {
        return false;
      }
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0;
      for (let index = 0; index < pixels.length; index += 16) {
        if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 60) {
          lit += 1;
        }
      }
      return lit > 1000;
    },
    { timeout: 60_000 },
  );
  await page.waitForTimeout(2500);
  await page.screenshot({
    path: path.join(root, '.cache/composed-preview-live.png'),
    fullPage: true,
  });
  assert.equal(await page.locator('canvas').count(), 1, 'Only one painted composition is visible.');
  async function frameSignature() {
    return page.locator('canvas').evaluate((canvas) => {
      const context = canvas.getContext('2d');
      let total = 0;
      for (let y = 0; y < 12; y += 1) {
        for (let x = 0; x < 12; x += 1) {
          const pixel = context.getImageData(
            Math.floor((canvas.width * (x + 0.5)) / 12),
            Math.floor((canvas.height * (y + 0.5)) / 12),
            1,
            1,
          ).data;
          total += pixel[0] * 3 + pixel[1] * 5 + pixel[2] * 7;
        }
      }
      return total;
    });
  }
  const beforeFilter = await frameSignature();
  await page.getByRole('tab', { name: 'Efek', exact: true }).click();
  await page.getByRole('button', { name: 'Monokrom', exact: true }).click();
  await page.getByRole('button', { name: 'Terapkan ke seluruh klip', exact: true }).click();
  await expect
    .poll(async () => Math.abs((await frameSignature()) - beforeFilter))
    .toBeGreaterThan(500);
  await page.screenshot({
    path: path.join(root, '.cache/composed-preview-filter.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Render preview hasil edit', exact: true }).click();
  await page.getByRole('button', { name: 'Hasil edit', exact: true }).waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(root, '.cache/composed-preview-exact.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Putar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.2);
  await page.getByRole('button', { name: 'Jeda', exact: true }).click();
  await page.getByRole('button', { name: 'Klip', exact: true }).click();
  await page.getByRole('button', { name: 'Edit klip', exact: true }).click();
  await page.getByRole('tab', { name: 'Efek', exact: true }).click();
  await page.getByRole('button', { name: 'Monokrom', exact: true }).waitFor();
  assert.deepEqual(errors, [], 'No browser/worker errors are permitted.');
  const evidence = {
    engine_directory: engine.directory,
    visible_video: true,
    single_canvas: true,
    live_filter_changes_pixels: true,
    exact_render_playback: true,
    gallery_reopen: true,
    errors,
  };
  await writeFile(
    path.join(root, '.cache/composed-preview-validation.json'),
    JSON.stringify(evidence, null, 2),
  );
  process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
} finally {
  await browser.close();
  await engine.stop();
}
