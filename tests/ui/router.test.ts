import { describe, expect, it } from 'vitest';
import type { Point } from '../../src/engine/model.ts';
import type { Rect, WireRequest } from '../../src/ui/editor/geometry.ts';
import { catalogue } from '../../src/content/index.ts';
import { createGeometryLookup } from '../../src/ui/editor/geometry.ts';
import { routeAround } from '../../src/ui/editor/router.ts';
import { wireRequests } from '../../src/ui/editor/wireRequests.ts';

const right = { x: 1, y: 0 };
const left = { x: -1, y: 0 };

const req = (id: string, start: Point, end: Point, source = id, target = id): WireRequest => ({
  id,
  source,
  target,
  start,
  startDir: right,
  end,
  endDir: left,
});

const orthogonal = (pts: readonly Point[]) =>
  pts.slice(1).every((p, i) => p.x === pts[i]!.x || p.y === pts[i]!.y);

/** Does the route pass through the inside of the rectangle? */
function crosses(points: readonly Point[], r: Rect) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const steps = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    for (let k = 0; k <= steps; k++) {
      const x = a.x + Math.sign(b.x - a.x) * k;
      const y = a.y + Math.sign(b.y - a.y) * k;
      if (x > r.x && x < r.x + r.width && y > r.y && y < r.y + r.height) return true;
    }
  }
  return false;
}

/** Cells covered by a route, with the direction of travel. */
function cells(points: readonly Point[]) {
  const out = new Set<string>();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const steps = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const dir = a.y === b.y ? 'h' : 'v';
    for (let k = 0; k <= steps; k++) {
      out.add(`${a.x + Math.sign(b.x - a.x) * k},${a.y + Math.sign(b.y - a.y) * k},${dir}`);
    }
  }
  return out;
}

describe('routeAround', () => {
  it('runs straight when nothing is in the way', () => {
    const routes = routeAround([req('w1', { x: 0, y: 0 }, { x: 10, y: 0 })], []);
    expect(routes.get('w1')).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it('goes around a part instead of through it', () => {
    const part = { x: 4, y: -2, width: 3, height: 4 };
    const route = routeAround([req('w1', { x: 0, y: 0 }, { x: 12, y: 0 })], [part]).get('w1')!;
    expect(orthogonal(route)).toBe(true);
    expect(crosses(route, part)).toBe(false);
    expect(route[0]).toEqual({ x: 0, y: 0 });
    expect(route.at(-1)).toEqual({ x: 12, y: 0 });
  });

  it('keeps different signals from running along each other', () => {
    const routes = routeAround(
      [req('w1', { x: 0, y: 0 }, { x: 20, y: 6 }), req('w2', { x: 0, y: 2 }, { x: 20, y: 8 })],
      [],
    );
    const a = cells(routes.get('w1')!);
    const shared = [...cells(routes.get('w2')!)].filter((c) => a.has(c));
    expect(shared).toEqual([]);
  });

  it('lets wires of one signal share a trunk', () => {
    const routes = routeAround(
      [
        req('w1', { x: 0, y: 0 }, { x: 20, y: 6 }, 's', 'x'),
        req('w2', { x: 0, y: 0 }, { x: 20, y: 10 }, 's', 'y'),
      ],
      [],
    );
    const a = cells(routes.get('w1')!);
    const shared = [...cells(routes.get('w2')!)].filter((c) => a.has(c));
    expect(shared.length).toBeGreaterThan(0);
  });

  it('enters input pins from outside the part', () => {
    const target = { x: 10, y: -2, width: 4, height: 4 };
    // The target pin is on the part's left edge; the wire starts to the right of the part.
    const route = routeAround([{ ...req('w1', { x: 20, y: 0 }, { x: 10, y: 0 }) }], [target]).get(
      'w1',
    )!;
    expect(route.at(-2)!.x).toBeLessThan(10);
    expect(crosses(route, target)).toBe(false);
  });
});

describe('routeAround with overlapping parts', () => {
  it('still reaches a pin that sits inside another part', () => {
    const overlapping = { x: 0, y: -4, width: 12, height: 8 }; // covers the target pin at x=10
    const route = routeAround([req('w1', { x: -10, y: 6 }, { x: 10, y: 0 })], [overlapping]).get(
      'w1',
    )!;
    // Arrives at the pin from its outside (the left), along the pin's row.
    expect(route.at(-1)).toEqual({ x: 10, y: 0 });
    expect(route.at(-2)!.y).toBe(0);
    expect(route.at(-2)!.x).toBeLessThan(10);
  });
});

describe('routeAround on real level circuits (T7.8 done-when)', () => {
  const geomOf = createGeometryLookup(catalogue.resolve, catalogue.displayName);

  /** Signals by wire: wires sharing a source or joined into one input are one signal. */
  function signals(requests: readonly WireRequest[]) {
    const parent = new Map<string, string>();
    const find = (k: string): string => (parent.get(k) === k ? k : find(parent.get(k)!));
    for (const r of requests) {
      for (const k of [`f${r.source}`, `t${r.target}`]) if (!parent.has(k)) parent.set(k, k);
      parent.set(find(`f${r.source}`), find(`t${r.target}`));
    }
    return new Map(requests.map((r) => [r.id, find(`f${r.source}`)]));
  }

  for (const id of ['2.3', '3.2', '3.4']) {
    it(`level ${id}: no wire through a part, no signals sharing a run or a corner`, () => {
      const { requests, obstacles } = wireRequests(catalogue.referenceCircuit(id), geomOf);
      const routes = routeAround(requests, obstacles);
      const signalOf = signals(requests);

      for (const [wire, points] of routes) {
        for (const part of obstacles)
          expect(crosses(points, part), `${wire} through a part`).toBe(false);
      }

      const covered = new Map<string, string>(); // "x,y,dir" -> signal
      const corners = new Map<string, string>(); // "x,y" -> signal
      for (const [wire, points] of routes) {
        const signal = signalOf.get(wire)!;
        for (const cell of cells(points)) {
          const owner = covered.get(cell);
          expect(
            owner === undefined || owner === signal,
            `${wire} runs along another signal at ${cell}`,
          ).toBe(true);
          covered.set(cell, signal);
        }
        for (const p of points.slice(1, -1)) corners.set(`${p.x},${p.y}`, signal);
      }
      for (const [wire, points] of routes) {
        const signal = signalOf.get(wire)!;
        for (const cell of cells(points)) {
          const [x, y] = cell.split(',');
          const owner = corners.get(`${x},${y}`);
          expect(
            owner === undefined || owner === signal,
            `${wire} touches another signal's corner at ${x},${y}`,
          ).toBe(true);
        }
      }
    });
  }
});
