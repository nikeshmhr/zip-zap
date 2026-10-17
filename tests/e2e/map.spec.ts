import { expect, test } from '@playwright/test';
import { unlockLevel } from './support/editor.ts';

test('a fresh game offers only level 0.1, and locked levels cannot be opened by URL', async ({
  page,
}) => {
  await page.goto('/#/map');
  await expect(page.getByRole('link', { name: /Start: 0.1 Relay/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^0\.1 Relay Ready to play$/ })).toBeVisible();
  await expect(page.locator('[data-status="locked"]')).toHaveCount(23);

  await page.goto('/#/level/2.1');
  await expect(page.getByRole('heading', { name: 'Level 2.1 is locked' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to level 0.1' }).click();
  await expect(page).toHaveURL(/#\/level\/0\.1$/);
});

test('shows solved levels with their best, and continues from the next one', async ({ page }) => {
  await unlockLevel(page, '1.1');
  await expect(page.getByRole('link', { name: /Continue: 1.1 NOT/ })).toBeVisible();
  const nand = page.getByRole('link', { name: /^0\.4 NAND.*solved$/ });
  await expect(nand).toContainText('2 relays');
  await expect(page.getByRole('region', { name: /Switches/ })).toContainText('4/4');
  await expect(page.getByRole('link', { name: /^1\.1 NOT Ready to play$/ })).toBeVisible();
  await expect(page.locator('[data-status="locked"]')).toHaveCount(19);
});
