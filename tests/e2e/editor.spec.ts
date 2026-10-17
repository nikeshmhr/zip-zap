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

/** Drags a wire between two pins, given as `part|pin|dir`. */
async function drawWire(page: Page, from: string, to: string) {
  const a = await centre(page, `[data-pin="${from}"]`);
  const b = await centre(page, `[data-pin="${to}"]`);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

test('draws wires between pins and refuses a second wire into an input', async ({ page }) => {
  await drawWire(page, 'in:A|out|out', 'p1|a|in');
  await drawWire(page, 'p1|out|out', 'out:OUT|in|in');
  await expect(page.locator('[data-wire]')).toHaveCount(2);

  await drawWire(page, 'p2|OUT|out', 'out:OUT|in|in');
  await expect(page.locator('[data-wire]')).toHaveCount(2);
  await expect(page.getByRole('status')).toContainText('already has a wire');
});

test('wires can be drawn backwards, from an input to an output', async ({ page }) => {
  await drawWire(page, 'p1|b|in', 'in:B|out|out');
  await expect(page.locator('[data-wire]')).toHaveCount(1);
});

test('selects a wire and deletes it with the Delete key', async ({ page }) => {
  await drawWire(page, 'in:A|out|out', 'p1|a|in');
  const wire = page.locator('[data-wire="w1"]');
  // Click the middle of the wire's path.
  const box = (await wire.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(wire).toHaveAttribute('data-selected');
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-wire]')).toHaveCount(0);
});

test('simulates live: toggling inputs updates wires and the lamp', async ({ page }) => {
  await drawWire(page, 'in:A|out|out', 'p1|a|in');
  await drawWire(page, 'in:B|out|out', 'p1|b|in');
  await drawWire(page, 'p1|out|out', 'out:OUT|in|in');
  const lampOn = page.locator('[data-part="out:OUT"] circle[data-on]').first();
  const wireA = page.locator('[data-wire="w1"]');

  await expect(lampOn).toBeVisible(); // NAND(0, 0) = 1
  await expect(wireA).not.toHaveAttribute('data-on');
  await page.locator('[data-toggle="A"]').click();
  await expect(wireA).toHaveAttribute('data-on');
  await page.locator('[data-toggle="B"]').click();
  await expect(page.locator('[data-part="out:OUT"] circle[data-on]')).toHaveCount(0);
});

test('shows an oscillation badge for a loop that never settles', async ({ page }) => {
  await drawWire(page, 'p2|OUT|out', 'p2|A|in');
  await page.locator('[data-toggle="A"]').click(); // irrelevant input, keeps the loop running
  await drawWire(page, 'in:A|out|out', 'p2|B|in');
  await expect(page.getByRole('alert')).toContainText('Oscillating');
});

test('adds parts from the toolbox by click (in a free spot) and by drag', async ({ page }) => {
  const parts = page.locator('[data-part]');
  await expect(parts).toHaveCount(5);
  await page.locator('[data-tool="nand"]').click();
  await expect(parts).toHaveCount(6);
  await expect(page.locator('[data-part="p3"]')).toHaveAttribute('data-selected');

  await page
    .locator('[data-tool="relayNC"]')
    .dragTo(page.getByRole('application'), { targetPosition: { x: 200, y: 400 } });
  await expect(parts).toHaveCount(7);
  await expect(page.locator('[data-part="p4"]')).toHaveAttribute('data-kind', 'relayNC');
});

test('the toolbox lists exactly the parts on offer', async ({ page }) => {
  const tools = await page
    .locator('[data-tool]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-tool')));
  expect(tools.slice(0, 6)).toEqual(['power', 'const0', 'const1', 'relayNO', 'relayNC', 'nand']);
  expect(tools).toContain('chip:ram4x4');
  expect(tools).not.toContain('in');
});
