import { expect, test } from '@playwright/test';

test('loads the app on the map', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Zip Zap');
  await expect(page.getByRole('heading', { name: 'Zip Zap' })).toBeVisible();
});

test('navigates between screens with the header', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Sandbox' })
    .click();
  await expect(page).toHaveURL(/#\/sandbox$/);
  await expect(page.getByRole('application', { name: 'Sandbox circuit' })).toBeVisible();
  await page.goto('/#/level/1.3');
  await expect(page.getByRole('heading', { name: '1.3 OR' })).toBeVisible();
  await expect(page.locator('[data-tool]')).toHaveCount(5); // constants, NAND, NOT, AND
});

test('follows the OS colour scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(19, 19, 21)');
});
