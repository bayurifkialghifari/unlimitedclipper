import { test, expect } from '@playwright/test';

const clipId = process.env.UC_TEST_AUTO_MOTION_CLIP_ID;

test.skip(!clipId, 'This scenario requires the isolated Auto Motion media fixture.');

test('reviews a saved motion proposal, applies it, and preserves undo and redo', async ({
  page,
  request,
}) => {
  test.setTimeout(5 * 60_000);
  const errors: string[] = [];
  page.on('pageerror', (failure) => {
    errors.push(failure.message);
  });
  await page.goto('/studio/' + clipId);
  await page.getByRole('tab', { name: 'Source segments', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Automatic editing', exact: true });
  const saved = await (await request.get('/api/v1/clips/' + clipId + '/auto-edit')).json();
  const expected = saved.payload.motion_review.anchors;
  await expect(panel).toContainText('Camera keyframes: ' + expected);
  await panel.locator('summary').click();
  await expect(panel.getByRole('button', { name: 'Time: 0.00s' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Time: 0.00s' }).focus();
  await page.keyboard.press('Enter');
  const apply = panel.getByRole('button', { name: 'Apply proposal', exact: true });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect
    .poll(async () => {
      const clip = await (await request.get('/api/v1/clips/' + clipId)).json();
      return clip.document.camera_motion?.length ?? 0;
    })
    .toBe(expected);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(async () => {
      const clip = await (await request.get('/api/v1/clips/' + clipId)).json();
      return clip.document.camera_motion?.length ?? 0;
    })
    .toBe(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(async () => {
      const clip = await (await request.get('/api/v1/clips/' + clipId)).json();
      return clip.document.camera_motion?.length ?? 0;
    })
    .toBe(expected);
  await page.reload();
  await page.getByRole('tab', { name: 'Source segments', exact: true }).click();
  await expect(panel).toContainText('Camera keyframes: ' + expected);
  await expect(panel.getByRole('button', { name: 'Apply proposal', exact: true })).toBeDisabled();
  await expect(
    panel.getByText('This clip changed. Generate a new proposal before applying.'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
