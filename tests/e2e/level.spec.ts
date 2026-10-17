import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { addPart, drawWire } from './support/editor.ts';

const tableRows = (page: Page) =>
  page.getByRole('region', { name: 'Truth table' }).locator('tbody tr');

test('shows a small truth table in full, and clicking a row sets the switches', async ({
  page,
}) => {
  await page.goto('/#/level/1.5');
  await expect(page.getByRole('heading', { name: '1.5 XOR' })).toBeVisible();
  await expect(tableRows(page)).toHaveCount(4);
  await tableRows(page).nth(2).click(); // A=1, B=0
  await expect(page.locator('[data-toggle="A"]')).toHaveAttribute('data-on');
  await expect(page.locator('[data-toggle="B"]')).not.toHaveAttribute('data-on');
  await expect(tableRows(page).nth(2)).toHaveAttribute('data-live');
});

test('shows large goals as a formula with sample rows and a "show all" option', async ({
  page,
}) => {
  await page.goto('/#/level/3.3');
  await expect(page.getByText('S + 16 × COUT = A + B + CIN')).toBeVisible();
  await expect(tableRows(page)).toHaveCount(8);
  // Bits are grouped into binary numbers.
  await expect(page.getByRole('region', { name: 'Truth table' }).locator('th')).toHaveText([
    'A',
    'B',
    'CIN',
    'S',
    'COUT',
  ]);
  await page.getByRole('button', { name: 'Show all 512 rows' }).click();
  await expect(tableRows(page)).toHaveCount(512);
});

test('runs the tests and marks failing rows', async ({ page }) => {
  await page.goto('/#/level/1.5');
  await addPart(page, 'nand'); // NAND is not XOR: row 00 fails
  await drawWire(page, 'in:A|out|out', 'p1|a|in');
  await drawWire(page, 'in:B|out|out', 'p1|b|in');
  await drawWire(page, 'p1|out|out', 'out:OUT|in|in');
  await page.getByRole('button', { name: 'Run tests' }).click();

  const summary = page.getByRole('region', { name: 'Tests' }).getByRole('status');
  await expect(summary).toContainText('3 of 4 cases pass');
  await expect(tableRows(page).nth(0)).toHaveAttribute('data-status', 'fail');
  await expect(tableRows(page).nth(0)).toContainText('got 1');
  await expect(tableRows(page).nth(1)).toHaveAttribute('data-status', 'pass');

  // Editing marks the results as out of date.
  await page.locator('[data-tool="const1"]').click();
  await expect(summary).toContainText('changed since this run');
});
