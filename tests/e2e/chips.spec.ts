import { expect, test } from '@playwright/test';
import { openLevel } from './support/editor.ts';

test('looks inside a chip from the toolbox, then deeper by double-clicking', async ({ page }) => {
  await openLevel(page, '3.3');
  await page.locator('[data-tool="chip:full-adder"]').hover();
  await page.getByRole('button', { name: 'Look inside Full Adder' }).click();

  const viewer = page.getByRole('dialog', { name: 'Inside Full Adder' });
  await expect(viewer).toContainText('Your design');
  await expect(viewer).toContainText('NAND gates');
  // Read-only: no toolbox, but the switches work.
  await expect(viewer.locator('[data-tool]')).toHaveCount(0);
  await viewer.locator('[data-toggle="A"]').click();
  await expect(viewer.locator('[data-toggle="A"]')).toHaveAttribute('data-on');

  await viewer.locator('[data-kind="chip:half-adder"]').first().dblclick();
  const inner = page.getByRole('dialog', { name: 'Inside Half Adder' });
  await expect(inner.getByRole('navigation', { name: 'Chips opened' })).toHaveText(
    'Full Adder › Half Adder',
  );
  await inner.getByRole('button', { name: 'Full Adder' }).click();
  await expect(page.getByRole('dialog', { name: 'Inside Full Adder' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('double-clicking a placed chip opens it, and digits in the viewer stay in the viewer', async ({
  page,
}) => {
  await openLevel(page, '1.3');
  await page.locator('[data-tool="chip:not"]').click();
  await page.locator('[data-part="p1"]').dblclick();
  const viewer = page.getByRole('dialog', { name: 'Inside NOT' });
  await expect(viewer).toBeVisible();
  await page.keyboard.press('1');
  await expect(viewer.locator('[data-toggle="A"]')).toHaveAttribute('data-on');
  // The level's own switch A wasn't touched.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const level = page.getByRole('application', { name: 'Level 1.3 circuit' });
  await expect(level.locator('[data-toggle="A"]')).not.toHaveAttribute('data-on');
});
