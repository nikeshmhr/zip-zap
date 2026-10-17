import { expect, test } from '@playwright/test';

test('loads the app', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Zip Zap');
  await expect(page.getByRole('heading', { name: 'Zip Zap' })).toBeVisible();
});
