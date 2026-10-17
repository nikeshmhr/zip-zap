import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { addPart, drawWire } from './support/editor.ts';

const tableRows = (page: Page) =>
  page.getByRole('region', { name: 'Truth table' }).locator('tbody tr');

test('shows a small truth table in full, and clicking a row sets the switches', async ({
  page,
}) => {
  await page.goto('/#/level/1.5');
  await expect(page.getByRole('heading', { name: '1.5 XOR' })).toBeVisible();
  await expect(tableRows(page)).toHaveCount(4);
  await tableRows(page).nth(2).click(); // A=1, B=0
  await expect(page.locator('[data-toggle="A"]')).toHaveAttribute('data-on');
  await expect(page.locator('[data-toggle="B"]')).not.toHaveAttribute('data-on');
  await expect(tableRows(page).nth(2)).toHaveAttribute('data-live');
});

test('shows large goals as a formula with sample rows and a "show all" option', async ({
  page,
}) => {
  await page.goto('/#/level/3.3');
  await expect(page.getByText('S + 16 × COUT = A + B + CIN')).toBeVisible();
  await expect(tableRows(page)).toHaveCount(8);
  // Bits are grouped into binary numbers.
  await expect(page.getByRole('region', { name: 'Truth table' }).locator('th')).toHaveText([
    'A',
    'B',
    'CIN',
    'S',
    'COUT',
  ]);
  await page.getByRole('button', { name: 'Show all 512 rows' }).click();
  await expect(tableRows(page)).toHaveCount(512);
});

test('runs the tests and marks failing rows', async ({ page }) => {
  await page.goto('/#/level/1.5');
  await addPart(page, 'nand'); // NAND is not XOR: row 00 fails
  await drawWire(page, 'in:A|out|out', 'p1|a|in');
  await drawWire(page, 'in:B|out|out', 'p1|b|in');
  await drawWire(page, 'p1|out|out', 'out:OUT|in|in');
  await page.getByRole('button', { name: 'Run tests' }).click();

  const summary = page.getByRole('region', { name: 'Tests' }).getByRole('status');
  await expect(summary).toContainText('3 of 4 cases pass');
  await expect(tableRows(page).nth(0)).toHaveAttribute('data-status', 'fail');
  await expect(tableRows(page).nth(0)).toContainText('got 1');
  await expect(tableRows(page).nth(1)).toHaveAttribute('data-status', 'pass');

  // Editing marks the results as out of date.
  await page.locator('[data-tool="const1"]').click();
  await expect(summary).toContainText('changed since this run');
});

test('a shorted circuit blocks the run, explains why and marks the wires', async ({ page }) => {
  await page.goto('/#/level/1.1');
  await page.waitForFunction(() => !!window.__zipzap);
  await page.evaluate(() => {
    const at = (x: number, y: number) => ({ x, y });
    window.__zipzap!.loadLevelCircuit('1.1', {
      components: [
        { id: 'in:A', kind: 'in', label: 'A', pos: at(0, 0), rot: 0 },
        { id: 'out:OUT', kind: 'out', label: 'OUT', pos: at(40, 0), rot: 0 },
        { id: 'p1', kind: 'nand', pos: at(12, -4), rot: 0 },
        { id: 'p2', kind: 'nand', pos: at(12, 4), rot: 0 },
      ],
      wires: [
        { id: 'w1', from: { comp: 'p1', pin: 'out' }, to: { comp: 'out:OUT', pin: 'in' } },
        { id: 'w2', from: { comp: 'p2', pin: 'out' }, to: { comp: 'out:OUT', pin: 'in' } },
      ],
    });
  });
  await expect(page.getByRole('alert')).toContainText('Short circuit');
  await expect(page.locator('[data-wire="w1"]')).toHaveAttribute('data-flagged');
  await page.getByRole('button', { name: 'Run tests' }).click();
  const summary = page.getByRole('region', { name: 'Tests' }).getByRole('status');
  await expect(summary).toContainText("there's a short circuit");
  await expect(summary).toContainText('Only relay outputs can be joined');
});

test('solving 0.4 shows metrics, unlocks NAND and leads on to 1.1', async ({ page }) => {
  await page.goto('/#/level/0.4');
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

  const dialog = page.getByRole('dialog', { name: 'Level solved' });
  await expect(dialog).toContainText('2 relays');
  await expect(dialog).toContainText('1 tick');
  await expect(dialog).toContainText('NAND is now in your toolbox');
  await dialog.getByRole('button', { name: /Next: 1.1 NOT/ }).click();

  await expect(page).toHaveURL(/#\/level\/1\.1$/);
  await expect(page.locator('[data-tool="nand"]')).toBeVisible();
  await expect(page.locator('[data-tool="relayNC"]')).toHaveCount(0);
});
