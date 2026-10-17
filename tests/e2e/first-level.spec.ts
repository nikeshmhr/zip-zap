/**
 * Spec AC 1 (automated half): a new player can complete level 0.1 in the browser.
 */
import { expect, test } from '@playwright/test';
import { drawWire } from './support/editor.ts';

test('a new player solves level 0.1 by dragging parts, wiring and running the tests', async ({
  page,
}) => {
  await page.goto('/#/level/0.1');

  // The concept card explains relays, then gets out of the way.
  const card = page.getByRole('dialog', { name: 'About Relay' });
  await expect(card).toContainText('A relay is a switch flipped by electricity');
  await card.getByRole('button', { name: "Let's build" }).click();

  // The obvious shortcut is refused, with a reason.
  await drawWire(page, 'in:A|out|out', 'out:OUT|in|in');
  await expect(page.getByRole('status').first()).toContainText('can only drive relay coils');
  await expect(page.locator('[data-wire]')).toHaveCount(0);

  // Build it properly: Power → relay contact → lamp, with A on the coil.
  const canvas = page.getByRole('application', { name: 'Level 0.1 circuit' });
  await page.locator('[data-tool="power"]').dragTo(canvas, { targetPosition: { x: 220, y: 200 } });
  await page
    .locator('[data-tool="relayNO"]')
    .dragTo(canvas, { targetPosition: { x: 450, y: 330 } });
  await drawWire(page, 'p1|out|out', 'p2|in|in');
  await drawWire(page, 'in:A|out|out', 'p2|coil|in');
  await drawWire(page, 'p2|out|out', 'out:OUT|in|in');

  // Try it live before testing.
  await page.locator('[data-toggle="A"]').click();
  await expect(page.locator('[data-part="out:OUT"] circle[data-on]').first()).toBeVisible();

  await page.getByRole('button', { name: 'Run tests' }).click();
  const solved = page.getByRole('dialog', { name: 'Level solved' });
  await expect(solved).toContainText('1 relay');
  await expect(solved.getByRole('button', { name: /Next: 0.2 Series/ })).toBeVisible();
});
