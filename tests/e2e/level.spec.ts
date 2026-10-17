import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

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
