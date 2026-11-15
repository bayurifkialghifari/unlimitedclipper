import { test, expect } from '@playwright/test';

const clipId = process.env.UC_TEST_HOOK_CLIP_ID;

test.skip(!clipId, 'This scenario requires the isolated hook proposal media fixture.');

test('reviews grounded hooks, applies both modes, and preserves undo and revision guards', async ({
  page,
  request,
}) => {
  test.setTimeout(10 * 60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  await page.goto('/studio/' + clipId);
  await expect(page.getByRole('heading', { name: 'Hook proposal media fixture' })).toBeVisible();
  await page.getByRole('tab', { name: 'Hook', exact: true }).click();
  const ideas = page.getByRole('region', { name: 'Hook ideas' });
  const first = ideas.getByRole('listitem').first();
  const savedSet = await (await request.get('/api/v1/clips/' + clipId + '/hook-proposals')).json();
  const firstText = savedSet.proposals[0].text;
  expect(savedSet.source_signature).toBeTruthy();
  expect(savedSet.proposals.length).toBeGreaterThan(1);
  await expect(first.getByRole('button')).toContainText(firstText);
  await expect(ideas.locator('q')).toHaveText(savedSet.proposals[0].source_quote);
  const title = page.getByLabel('Opening title', { exact: true });
  const initialTitle = await title.inputValue();
  await ideas.getByRole('button', { name: 'Use as overlay: ' + firstText }).click();
  await expect(title).toHaveValue(firstText);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(title).toHaveValue(initialTitle);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(title).toHaveValue(firstText);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await expect(ideas.getByText('The clip source or transcript changed.')).toHaveCount(0);
  const freshClip = await (await request.get('/api/v1/clips/' + clipId)).json();
  expect(freshClip.document.title.text).toBe(firstText);
  expect(freshClip.document.intro_card).toBeFalsy();
  const cardText = savedSet.proposals[1].text;
  await ideas.getByRole('listitem').nth(1).getByRole('button').click();
  await expect(ideas.locator('q')).toHaveText(savedSet.proposals[1].source_quote);
  const card = ideas.getByRole('button', { name: 'Use as opening card: ' + cardText }).first();
  await expect(card).toBeEnabled();
  await card.focus();
  await page.keyboard.press('Space');
  await expect(title).toHaveCount(0);
  await expect(page.getByLabel('Card text')).toHaveValue(cardText);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  const cardClip = await (await request.get('/api/v1/clips/' + clipId)).json();
  expect(cardClip.document.version).toBe(4);
  expect(cardClip.document.intro_card?.text).toBe(cardText);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(title).toHaveValue(firstText);
  await page.keyboard.press('Control+Y');
  await expect(title).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});
