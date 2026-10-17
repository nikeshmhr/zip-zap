import { expect, test } from '@playwright/test';
import { unlockLevel } from './support/editor.ts';

test('theme and motion settings apply at once and survive a reload', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByRole('radio', { name: 'Dark' }).check();
  await page.getByRole('radio', { name: 'Reduce motion' }).check();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveAttribute('data-motion', 'reduce');
  await page.waitForTimeout(700); // autosave
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
});

test('rejects an import file that is not a save', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByLabel('Save file to import').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello": "world"}'),
  });
  await expect(page.getByRole('alert')).toContainText('not a Zip Zap save');
});

test('reset clears progress but keeps settings', async ({ page }) => {
  await unlockLevel(page, '1.1');
  await page.goto('/#/settings');
  await page.getByRole('radio', { name: 'Light' }).check();
  await page.getByRole('button', { name: 'Reset progress…' }).click();
  await page
    .getByRole('dialog', { name: 'Reset progress' })
    .getByRole('button', { name: 'Reset everything' })
    .click();
  await page.waitForLoadState('load');
  await page.goto('/#/map');
  await expect(page.getByRole('link', { name: /Start: 0.1 Relay/ })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
