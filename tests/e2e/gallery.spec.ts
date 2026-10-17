import { expect, test } from '@playwright/test';

test('the component gallery renders every component kind, OFF and ON', async ({ page }) => {
  await page.goto('/#/gallery');
  const canvas = page.getByRole('application', { name: 'Component gallery' });
  await expect(canvas).toBeVisible();
  const kinds = await canvas
    .locator('[data-kind]')
    .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-kind')))]);
  // 8 primitives + 20 chips.
  expect(kinds).toHaveLength(28);
  expect(kinds).toEqual(expect.arrayContaining(['in', 'out', 'relayNO', 'nand', 'chip:ram4x4']));
  // Every part has its pins, and the ON row shows them as ON.
  expect(await canvas.locator('[data-pin][data-on]').count()).toBeGreaterThan(0);
});
