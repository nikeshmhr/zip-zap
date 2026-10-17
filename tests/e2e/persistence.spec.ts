/**
 * Spec AC 4, 6 and 7: unlocked chips persist, bests persist, and progress survives reloads
 * and moves between browsers by export and import.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { drawWire, openLevel, unlockLevel } from './support/editor.ts';

/** Solves 0.4 (NAND from two normally-closed relays) through the UI. */
async function solveNand(page: Page) {
  await openLevel(page, '0.4');
  const canvas = page.getByRole('application');
  const drop = (kind: string, x: number, y: number) =>
    page.locator(`[data-tool="${kind}"]`).dragTo(canvas, { targetPosition: { x, y } });
  await drop('power', 200, 300);
  await drop('relayNC', 420, 180);
  await drop('relayNC', 420, 420);
  await drawWire(page, 'p1|out|out', 'p2|in|in');
  await drawWire(page, 'p1|out|out', 'p3|in|in');
  await drawWire(page, 'in:A|out|out', 'p2|coil|in');
  await drawWire(page, 'in:B|out|out', 'p3|coil|in');
  await drawWire(page, 'p2|out|out', 'out:OUT|in|in');
  await drawWire(page, 'p3|out|out', 'out:OUT|in|in');
  await page.getByRole('button', { name: 'Run tests' }).click();
  await page
    .getByRole('dialog', { name: 'Level solved' })
    .getByRole('button', { name: 'Keep optimizing' })
    .click();
}

test('solving 0.4 opens chapter 1 on the map', async ({ page }) => {
  await solveNand(page);
  await page.goto('/#/map');
  await expect(page.getByRole('link', { name: '0.4 NAND, solved' })).toContainText('2 relays');
  await expect(page.getByRole('link', { name: '1.1 NOT, ready to play' })).toBeVisible();
});

test('a reload restores progress, bests and every circuit', async ({ page }) => {
  await solveNand(page);
  // An unsolved level with work in progress.
  await page.goto('/#/level/1.1');
  await page.getByRole('button', { name: "Let's build" }).click();
  await page.locator('[data-tool="nand"]').click();
  await page.waitForTimeout(700);

  await page.reload();
  await expect(page.locator('[data-part="p1"]')).toHaveAttribute('data-kind', 'nand');
  await expect(page.getByRole('dialog')).toHaveCount(0); // concept card already seen
  await page.goto('/#/level/0.4');
  await expect(page.locator('[data-wire]')).toHaveCount(6);
  await expect(page.getByText('Solved · best 2 relays, delay 1')).toBeVisible();
});

test('export, then import into a fresh browser, restores the same state', async ({
  page,
  browser,
}) => {
  await unlockLevel(page, '2.1');
  await page.goto('/#/settings');
  await page.getByRole('radio', { name: 'Dark' }).check();
  await page.waitForTimeout(700);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export save' }).click();
  const file = await (await download).path();
  expect((await download).suggestedFilename()).toMatch(/^zipzap-save-\d{8}\.json$/);
  const exported = JSON.parse(readFileSync(file, 'utf8'));
  expect(Object.keys(exported.progress)).toHaveLength(10);

  // A brand-new browser profile.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto('/#/settings');
  await other.getByLabel('Save file to import').setInputFiles(file);
  const confirm = other.getByRole('dialog', { name: 'Import save' });
  await expect(confirm).toContainText('10 levels solved');
  await confirm.getByRole('button', { name: 'Replace my progress' }).click();
  await other.waitForLoadState('load');
  await other.goto('/#/map');
  await expect(other.getByRole('link', { name: /Continue: 2.1 Mux/ })).toBeVisible();
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
  await fresh.close();
});
