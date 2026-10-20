import { expect, test } from '@playwright/test';
import { openLevel, unlockLevel } from './support/editor.ts';

test('the Dev popover loads a level’s solution after a confirming second click', async ({
  page,
}) => {
  await openLevel(page, '3.2');
  await page.getByRole('button', { name: 'Dev' }).click();
  const tools = page.getByRole('dialog', { name: 'Developer tools' });
  await tools.getByRole('button', { name: 'Load solution' }).click();
  await tools.getByRole('button', { name: 'Replace my circuit?' }).click();
  await expect(tools.getByRole('status')).toContainText('Loaded 3.2');

  await page.keyboard.press('Escape');
  await expect(tools).toHaveCount(0);
  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(page.getByRole('dialog', { name: 'Level solved' })).toBeVisible();
});

test('the Dev popover unlocks every level', async ({ page }) => {
  await unlockLevel(page, '0.1');
  await page.getByRole('button', { name: 'Dev' }).click();
  const tools = page.getByRole('dialog', { name: 'Developer tools' });
  await expect(tools).toContainText('Open a level');
  await tools.getByRole('button', { name: 'Unlock all' }).click();
  await expect(tools.getByRole('status')).toHaveText('Every level is solved.');

  await page.mouse.click(5, 300); // outside closes it
  await expect(tools).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-status="solved"]')).toHaveCount(24);
  await expect(page.locator('[data-status="locked"]')).toHaveCount(0);
});
