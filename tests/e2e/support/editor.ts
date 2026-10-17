/** Shared helpers for driving the circuit editor in e2e tests. */
import type { Page } from '@playwright/test';

export async function centre(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags a wire between two pins, given as `part|pin|dir`. */
export async function drawWire(page: Page, from: string, to: string) {
  const a = await centre(page, `[data-pin="${from}"]`);
  const b = await centre(page, `[data-pin="${to}"]`);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

/** Adds a part from the toolbox by clicking it. */
export const addPart = (page: Page, kind: string) => page.locator(`[data-tool="${kind}"]`).click();

/** Unlocks a level by marking every earlier level solved (development hook). */
export async function unlockLevel(page: Page, id: string) {
  await page.goto('/#/map');
  await page.waitForFunction(() => !!window.__zipzap);
  await page.evaluate((level) => window.__zipzap!.solveBefore(level), id);
}

/** Unlocks and opens a level, dismissing the concept card shown on a first visit. */
export async function openLevel(page: Page, id: string) {
  await unlockLevel(page, id);
  await page.goto(`/#/level/${id}`);
  await page.getByRole('button', { name: "Let's build" }).click();
}

/** A point halfway along a wire, in page coordinates (wires bend, so not its box's centre). */
export async function wireMidpoint(page: Page, wireId: string) {
  return page
    .locator(`[data-wire="${wireId}"] path`)
    .first()
    .evaluate((path) => {
      const p = path as SVGPathElement;
      const point = p.getPointAtLength(p.getTotalLength() / 2);
      const m = p.getScreenCTM()!;
      return { x: point.x * m.a + point.y * m.c + m.e, y: point.x * m.b + point.y * m.d + m.f };
    });
}
