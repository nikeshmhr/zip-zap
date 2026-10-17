import { expect, test } from '@playwright/test';
import { drawWire, unlockLevel } from './support/editor.ts';

test('a fresh sandbox offers basic parts and free switches and lamps, but no chips yet', async ({
  page,
}) => {
  await page.goto('/#/sandbox');
  const tools = page.locator('[data-tool]');
  await expect(tools).toHaveCount(7);
  await expect(page.locator('[data-tool^="chip:"]')).toHaveCount(0);
  await expect(page.getByText('chips you unlock in the levels appear here too')).toBeVisible();
});

test('adds named switches and lamps that can be moved and deleted', async ({ page }) => {
  await page.goto('/#/sandbox');
  await page.locator('[data-tool="in"]').click();
  await page.locator('[data-tool="out"]').click();
  await expect(page.locator('[data-part="p1"]')).toContainText('C');
  await expect(page.locator('[data-part="p2"]')).toContainText('OUT2');
  await page.locator('[data-part="in:A"] text').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-part="in:A"]')).toHaveCount(0);
});

test('offers unlocked chips, and the sandbox circuit survives a reload', async ({ page }) => {
  await unlockLevel(page, '1.3'); // NAND, NOT and AND unlocked
  await page.goto('/#/sandbox');
  await expect(page.locator('[data-tool^="chip:"]')).toHaveCount(2);
  await page.locator('[data-tool="nand"]').click();
  await drawWire(page, 'in:A|out|out', 'p1|a|in');
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('[data-part="p1"]')).toHaveAttribute('data-kind', 'nand');
  await expect(page.locator('[data-wire]')).toHaveCount(1);
});
