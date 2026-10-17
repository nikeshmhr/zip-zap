/**
 * Spec §11 and AC 8: automated accessibility checks, keyboard play, and ON/OFF wires that
 * differ without colour.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { unlockLevel } from './support/editor.ts';

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id}: ${v.help} (${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(', ')})`,
    );
}

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, path] of [
    ['map', '/#/map'],
    ['settings', '/#/settings'],
    ['sandbox', '/#/sandbox'],
  ] as const) {
    test(`the ${name} screen has no serious accessibility violations (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await unlockLevel(page, '2.1');
      await page.goto(path);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
}

for (const scheme of ['light', 'dark'] as const) {
  test(`a level screen and its concept card have no serious violations (${scheme})`, async ({
    page,
  }) => {
    // Without the dialog's fade-in, so contrast is measured on the settled colours.
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await unlockLevel(page, '1.5');
    await page.goto('/#/level/1.5');
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole('button', { name: "Let's build" }).click();
    expect(await seriousViolations(page)).toEqual([]);
  });
}

/** Presses Tab until `target` has focus (fails after 80 presses). */
async function tabTo(page: Page, target: ReturnType<Page['locator']>) {
  for (let i = 0; i < 80; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Could not reach the target with Tab');
}

test('a keyboard-only player can toggle the switches and run the tests', async ({ page }) => {
  await unlockLevel(page, '1.1');
  await page.goto('/#/level/1.1');
  await page.keyboard.press('Enter'); // "Let's build" has focus in the concept card
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // A correct NOT, loaded through the development hook: wiring itself needs a pointer.
  await page.evaluate(() => {
    const at = (x: number, y: number) => ({ x, y });
    window.__zipzap!.loadLevelCircuit('1.1', {
      components: [
        { id: 'in:A', kind: 'in', label: 'A', pos: at(0, 0), rot: 0 },
        { id: 'out:OUT', kind: 'out', label: 'OUT', pos: at(40, 0), rot: 0 },
        { id: 'p1', kind: 'nand', pos: at(14, -1), rot: 0 },
      ],
      wires: [
        { id: 'w1', from: { comp: 'in:A', pin: 'out' }, to: { comp: 'p1', pin: 'a' } },
        { id: 'w2', from: { comp: 'in:A', pin: 'out' }, to: { comp: 'p1', pin: 'b' } },
        { id: 'w3', from: { comp: 'p1', pin: 'out' }, to: { comp: 'out:OUT', pin: 'in' } },
      ],
    });
  });

  const tryIt = page.getByRole('region', { name: 'Try it' });
  const switchA = tryIt.getByRole('button', { name: 'A' });
  await tabTo(page, switchA);
  await page.keyboard.press('Space');
  await expect(switchA).toHaveAttribute('aria-pressed', 'true');
  await expect(tryIt).toContainText('OUT OFF');

  await tabTo(page, page.getByRole('button', { name: 'Run tests' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Level solved' })).toBeVisible();
});

test('ON and OFF wires differ without colour (greyscale)', async ({ page }) => {
  await page.goto('/#/sandbox');
  await page.locator('[data-tool="power"]').click(); // p1: always ON
  await page.locator('[data-tool="const0"]').click(); // p2: always OFF
  await page.locator('[data-tool="out"]').click(); // OUT2
  const { drawWire } = await import('./support/editor.ts');
  await drawWire(page, 'p1|out|out', 'out:OUT|in|in');
  await drawWire(page, 'p2|out|out', 'p3|in|in');
  await page.addStyleTag({
    content: 'html { filter: grayscale(1) } [class*="flow"] { display: none }',
  });

  /** Dark-ish pixels per unit of wire length inside the wire's box. */
  async function inkDensity(selector: string) {
    const box = (await page.locator(selector).boundingBox())!;
    const shot = PNG.sync.read(await page.screenshot({ clip: box }));
    let ink = 0;
    for (let i = 0; i < shot.data.length; i += 4) {
      const lum = 0.2126 * shot.data[i]! + 0.7152 * shot.data[i + 1]! + 0.0722 * shot.data[i + 2]!;
      if (lum < 200) ink++;
    }
    return ink / (box.width + box.height);
  }
  const on = await inkDensity('[data-wire="w1"]');
  const off = await inkDensity('[data-wire="w2"]');
  expect(await page.locator('[data-wire="w1"]').getAttribute('data-on')).not.toBeNull();
  expect(on / off).toBeGreaterThan(2);
});
