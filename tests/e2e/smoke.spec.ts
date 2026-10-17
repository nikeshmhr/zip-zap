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
  await expect(page.getByRole('heading', { name: 'Sandbox' })).toBeVisible();
  await page.goto('/#/level/2.3');
  await expect(page.getByRole('heading', { name: 'Level 2.3' })).toBeVisible();
});

test('follows the OS colour scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(19, 19, 21)');
});
