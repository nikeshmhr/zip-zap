/**
 * T7.5: editing a Tiny RAM-sized circuit stays smooth. Measured in the development build,
 * which is slower than production, with headroom for CI machines.
 */
import { expect, test } from '@playwright/test';
import { openLevel } from './support/editor.ts';

test('dragging a part in the Tiny RAM reference circuit keeps frames smooth', async ({ page }) => {
  await openLevel(page, '4.6');
  await page.evaluate(() => window.__zipzap!.loadReference('4.6'));
  await page.keyboard.press('f');
  const box = (await page.locator('[data-kind="chip:decoder"]').first().boundingBox())!;

  await page.evaluate(() => {
    const w = window as unknown as { frames: number[] };
    w.frames = [];
    let last = performance.now();
    const tick = (t: number) => {
      w.frames.push(t - last);
      last = t;
      if (w.frames.length < 300) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 50; i++) await page.mouse.move(x + i * 3, y + Math.sin(i / 5) * 40);
  await page.mouse.up();

  const frames = await page.evaluate(() =>
    (window as unknown as { frames: number[] }).frames.slice(2),
  );
  const sorted = [...frames].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  console.log(`median frame ${median.toFixed(1)} ms over ${frames.length} frames`);
  expect(median).toBeLessThan(20); // ~60 fps (16.7 ms), with headroom
});
