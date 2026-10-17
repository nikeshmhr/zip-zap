import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { openLevel } from './support/editor.ts';

const steps = (page: Page) => page.getByRole('region', { name: 'Steps' }).locator('tbody tr');

test('memory levels show their goal as steps, with clock edges marked', async ({ page }) => {
  await openLevel(page, '4.3');
  await expect(steps(page)).toHaveCount(15);
  // Step 1 sets the starting values: no edge yet, and Q isn't checked (warm-up).
  await expect(steps(page).nth(0)).not.toContainText('↑');
  await expect(steps(page).nth(0).locator('td').last()).toHaveText('—');
  // Step 2 is the first rising edge.
  await expect(steps(page).nth(1)).toContainText('↑');

  await openLevel(page, '4.1');
  await expect(page.getByRole('table', { name: 'Sequence 2' })).toBeVisible();
});
