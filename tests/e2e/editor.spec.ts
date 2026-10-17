import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/** Centre of an element on screen. */
async function centre(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const selectedParts = (page: Page) =>
  page.locator('[data-selected]').evaluateAll((els) => els.map((e) => e.getAttribute('data-part')));

test.beforeEach(async ({ page }) => {
  await page.goto('/#/sandbox');
  await expect(page.locator('[data-part="p1"]')).toBeVisible();
});

test('drags a part in whole grid steps and selects it', async ({ page }) => {
  const nand = page.locator('[data-part="p1"]');
  const before = await nand.getAttribute('transform');
  const start = await centre(page, '[data-part="p1"]');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y + 30, { steps: 6 });
  await page.mouse.up();
  const after = await nand.getAttribute('transform');
  expect(after).not.toBe(before);
  expect(after).toMatch(/^translate\(-?\d+ -?\d+\)$/);
  expect(await selectedParts(page)).toEqual(['p1']);
});

test('clicking empty canvas clears the selection; dragging box-selects', async ({ page }) => {
  const canvas = page.getByRole('application', { name: 'Sandbox circuit' });
  const box = (await canvas.boundingBox())!;
  await page.locator('[data-part="p1"]').click();
  expect(await selectedParts(page)).toEqual(['p1']);
  await page.mouse.click(box.x + 10, box.y + 10);
  expect(await selectedParts(page)).toEqual([]);

  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, { steps: 6 });
  await page.mouse.up();
  expect((await selectedParts(page)).sort()).toEqual(['in:A', 'in:B', 'out:OUT', 'p1', 'p2']);
});

test('level IO cannot be dragged', async ({ page }) => {
  const input = page.locator('[data-part="in:A"]');
  const before = await input.getAttribute('transform');
  const start = await centre(page, '[data-part="in:A"] text');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y + 40, { steps: 6 });
  await page.mouse.up();
  expect(await input.getAttribute('transform')).toBe(before);
});
