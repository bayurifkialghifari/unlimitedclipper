import { test, expect } from '@playwright/test';
import path from 'node:path';

test('camera keyframes update the live frame and persist through reopen', async ({
  page,
  request,
}) => {
  const settings = await (await request.get('/api/v1/settings')).json();
  await request.put('/api/v1/settings', {
    data: { ...settings, language: 'en', auto_update: false },
  });
  const imported = await (
    await request.post('/api/v1/imports/local', {
      data: { path: path.resolve('.cache/fixtures/two-moving-faces.mp4') },
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
  let clip = await (
    await request.post('/api/v1/projects/' + projectId + '/clips', {
      data: { name: 'Camera motion fixture', start_ms: 0, end_ms: 6000 },
    })
  ).json();
  clip.document.keyframes = [{ time_ms: 0, x: clip.document.crop.x, y: clip.document.crop.y }];
  clip = await (await request.put('/api/v1/clips/' + clip.id, { data: clip })).json();
  const errors: string[] = [];
  page.on('pageerror', (failure) => errors.push(failure.message));
  await page.goto('/studio/' + clip.id);
  await page.getByRole('tab', { name: 'Crop', exact: true }).click();
  const controls = page.getByRole('region', { name: 'Camera motion', exact: true });
  await expect(
    controls.getByRole('button', { name: 'Add camera keyframe at playhead' }),
  ).toBeEnabled();
  const canvas = page.locator('canvas').first();
  const sample = async () =>
    canvas.evaluate((element: HTMLCanvasElement) => {
      const context = element.getContext('2d')!;
      let sum = 0;
      for (let y = 0; y < 12; y += 1) {
        for (let x = 0; x < 12; x += 1) {
          const pixel = context.getImageData(
            Math.floor((element.width * (x + 0.5)) / 12),
            Math.floor((element.height * (y + 0.5)) / 12),
            1,
            1,
          ).data;
          sum += pixel[0] * 3 + pixel[1] * 5 + pixel[2] * 7;
        }
      }
      return sum;
    });
  await expect.poll(sample).toBeGreaterThan(0);
  const before = await sample();
  await controls.getByRole('button', { name: 'Add camera keyframe at playhead' }).focus();
  await page.keyboard.press('Enter');
  await controls.getByLabel('Zoom (%)', { exact: true }).fill('200');
  await controls.getByLabel('Center X (%)', { exact: true }).fill('80');
  await controls.getByLabel('Transition', { exact: true }).selectOption('smooth');
  await expect.poll(async () => Math.abs((await sample()) - before)).toBeGreaterThan(3000);
  await expect(page.getByRole('button', { name: 'Camera motion 00:00' })).toHaveCount(1);
  await expect
    .poll(async () => {
      const saved = await (await request.get('/api/v1/clips/' + clip.id)).json();
      return saved.document.camera_motion?.[0]?.zoom;
    })
    .toBe(2);
  const migrated = await (await request.get('/api/v1/clips/' + clip.id)).json();
  expect(migrated.document.keyframes).toEqual([]);
  expect(migrated.document.camera_motion).toHaveLength(1);
  await page.reload();
  await page.getByRole('tab', { name: 'Crop', exact: true }).click();
  await expect(controls.getByLabel('Zoom (%)', { exact: true })).toHaveValue('200');
  await expect(controls.getByLabel('Center X (%)', { exact: true })).toHaveValue('80');
  await page.getByRole('tab', { name: 'Source segments', exact: true }).click();
  await page.getByRole('button', { name: 'Add text note', exact: true }).click();
  const note = page.getByRole('group', { name: 'Add text note', exact: true });
  const beforeNote = await sample();
  await note.getByLabel('Text', { exact: true }).fill('Moving note');
  await expect.poll(async () => Math.abs((await sample()) - beforeNote)).toBeGreaterThan(100);
  const staticNote = await sample();
  const textMotion = note.getByRole('region', { name: 'Text motion', exact: true });
  await textMotion.getByRole('button', { name: 'Add text keyframe at playhead' }).click();
  await textMotion.getByLabel('Scale (%)', { exact: true }).fill('150');
  await textMotion.getByLabel('Opacity (%)', { exact: true }).fill('60');
  await expect.poll(async () => Math.abs((await sample()) - staticNote)).toBeGreaterThan(100);
  await expect(page.getByRole('button', { name: 'Text motion 00:00' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Text motion 00:00' }).click();
  await page.getByRole('button', { name: 'Drag selected text position' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => {
      const saved = await (await request.get('/api/v1/clips/' + clip.id)).json();
      return saved.document.visual_layers?.[0]?.motion?.[0]?.x;
    })
    .toBeGreaterThan(0.5);
  await page.reload();
  await page.getByRole('tab', { name: 'Source segments', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Text motion' }).getByLabel('Scale (%)'),
  ).toHaveValue('150');
  const beforeBroll = await sample();
  await page.getByRole('button', { name: 'Add local B-roll', exact: true }).click();
  const broll = page.getByRole('group', { name: 'Add local B-roll', exact: true });
  await expect.poll(async () => Math.abs((await sample()) - beforeBroll)).toBeGreaterThan(1000);
  const mediaMotion = broll.getByRole('region', { name: 'B-roll motion', exact: true });
  const staticBroll = await sample();
  await mediaMotion.getByRole('button', { name: 'Add B-roll keyframe at playhead' }).focus();
  await page.keyboard.press('Enter');
  await mediaMotion.getByLabel('Scale (%)', { exact: true }).fill('160');
  await mediaMotion.getByLabel('Opacity (%)', { exact: true }).fill('45');
  await expect.poll(async () => Math.abs((await sample()) - staticBroll)).toBeGreaterThan(1000);
  await expect
    .poll(async () => {
      const saved = await (await request.get('/api/v1/clips/' + clip.id)).json();
      return saved.document.visual_layers?.find((layer: { kind: string }) => layer.kind === 'broll')
        ?.motion?.[0]?.scale;
    })
    .toBe(1.6);
  await page.reload();
  await page.getByRole('tab', { name: 'Source segments', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'B-roll motion' }).getByLabel('Opacity (%)'),
  ).toHaveValue('45');
  let limited = await (
    await request.post('/api/v1/projects/' + projectId + '/clips', {
      data: { name: 'Contain layout fixture', start_ms: 0, end_ms: 6000 },
    })
  ).json();
  limited.document.layout = 'contain';
  limited = await (await request.put('/api/v1/clips/' + limited.id, { data: limited })).json();
  await page.goto('/studio/' + limited.id);
  await page.getByRole('tab', { name: 'Crop', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Camera motion' }).getByRole('button', {
      name: 'Add camera keyframe at playhead',
    }),
  ).toBeDisabled();
  await expect(
    page.getByText('Camera motion requires portrait, square, or landscape layout.'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
