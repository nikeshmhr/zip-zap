import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { drawWire, openLevel } from './support/editor.ts';

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

test('a failed run jumps to the first failing step and shows the circuit at that step', async ({
  page,
}) => {
  await openLevel(page, '4.3');
  // A D latch is not a flip-flop: it lets D through while the clock is high.
  await page.locator('[data-tool="chip:d-latch"]').click();
  await drawWire(page, 'in:D|out|out', 'p1|D|in');
  await drawWire(page, 'in:CLK|out|out', 'p1|EN|in');
  await drawWire(page, 'p1|Q|out', 'out:Q|in|in');
  await page.getByRole('button', { name: 'Run tests' }).click();

  const failing = steps(page).nth(8); // step 9: D rises while CLK is high
  await expect(failing).toHaveAttribute('data-status', 'fail');
  await expect(failing).toHaveAttribute('data-live');
  // The canvas shows that step: the latch passed D through, so Q is lit.
  await expect(page.locator('[data-part="out:Q"] circle[data-on]').first()).toBeVisible();

  // Scrub back to step 8, where Q was still 0.
  await steps(page).nth(7).click();
  await expect(steps(page).nth(7)).toHaveAttribute('data-live');
  await expect(page.locator('[data-part="out:Q"] circle[data-on]')).toHaveCount(0);

  // Touching a switch leaves the scrubbed step.
  await page.locator('[data-toggle="D"]').click();
  await expect(page.locator('tr[data-live]')).toHaveCount(0);
});

test('the timing view draws the signals and scrubs by clicking a step', async ({ page }) => {
  await openLevel(page, '4.2');
  await page.getByRole('tab', { name: 'Timing' }).click();
  await expect(page.getByRole('img', { name: /Timing diagram/ })).toBeVisible();
  await page.locator('[data-wave-step="0:4"]').click();
  await page.getByRole('tab', { name: 'Steps' }).click();
  await expect(steps(page).nth(4)).toHaveAttribute('data-live');
});

test('tick-by-tick mode advances the circuit one gate delay per click', async ({ page }) => {
  await openLevel(page, '1.1');
  await page.locator('[data-tool="nand"]').click();
  await drawWire(page, 'in:A|out|out', 'p1|a|in');
  await drawWire(page, 'in:A|out|out', 'p1|b|in');
  await drawWire(page, 'p1|out|out', 'out:OUT|in|in');
  const lampOn = page.locator('[data-part="out:OUT"] circle[data-on]');
  await expect(lampOn.first()).toBeVisible(); // NOT 0 = 1

  const controls = page.getByRole('group', { name: 'Tick by tick' });
  await controls.getByRole('button', { name: 'Tick by tick' }).click();
  await page.locator('[data-toggle="A"]').click();
  await expect(controls).toContainText('Tick 0 · still changing');
  await expect(page.locator('[data-part="p1"]')).toHaveAttribute('data-pending');
  await expect(lampOn.first()).toBeVisible(); // not yet

  await controls.getByRole('button', { name: 'Next tick ▸' }).click();
  await expect(controls).toContainText('Tick 1 · settled');
  await expect(lampOn).toHaveCount(0);
  await expect(controls.getByRole('button', { name: 'Next tick ▸' })).toBeDisabled();
});
