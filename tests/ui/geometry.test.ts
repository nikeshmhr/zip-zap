import { describe, expect, it } from 'vitest';
import type { ComponentInstance, Rotation } from '../../src/engine/model.ts';
import { PRIMITIVES } from '../../src/engine/primitives.ts';
import { catalogue } from '../../src/content/index.ts';
import {
  branchPoint,
  findFreeSpot,
  partGeometry,
  partRect,
  pinFacing,
  pinWorld,
  rectsIntersect,
  rotatedSize,
  routeWire,
  routeWires,
  simplify,
} from '../../src/ui/editor/geometry.ts';

const at = (rot: Rotation): ComponentInstance => ({
  id: 'p1',
  kind: 'nand',
  pos: { x: 10, y: 20 },
  rot,
});

describe('partGeometry', () => {
  it('puts NAND inputs on the left two units apart and centres the output', () => {
    const g = partGeometry(PRIMITIVES.nand);
    expect(g).toMatchObject({ width: 5, height: 4 });
    expect(g.pins).toEqual([
      { name: 'a', dir: 'in', x: 0, y: 1 },
      { name: 'b', dir: 'in', x: 0, y: 3 },
      { name: 'out', dir: 'out', x: 5, y: 2 },
    ]);
  });

  it('places every pin of every component on whole grid points, inside the part', () => {
    const defs = [
      ...Object.values(PRIMITIVES),
      ...catalogue.chips.map((c) => catalogue.resolve(`chip:${c.id}`)!),
    ];
    for (const def of defs) {
      const g = partGeometry(def, catalogue.displayName(def.kind));
      for (const pin of g.pins) {
        expect(Number.isInteger(pin.x) && Number.isInteger(pin.y), `${def.kind}.${pin.name}`).toBe(
          true,
        );
        expect(pin.y).toBeGreaterThan(0);
        expect(pin.y).toBeLessThan(g.height);
      }
      expect(new Set(g.pins.map((p) => `${p.x},${p.y}`)).size).toBe(g.pins.length);
    }
  });

  it('makes chip boxes wide enough for their names', () => {
    const ram = catalogue.resolve('chip:ram4x4')!;
    expect(partGeometry(ram, 'RAM 4×4').width).toBeGreaterThanOrEqual(6);
    expect(partGeometry(ram, 'RAM 4×4').height).toBe(16);
  });
});

describe('rotation', () => {
  const g = partGeometry(PRIMITIVES.nand);
  const out = g.pins[2]!;

  it('keeps the rotated box anchored at the part position', () => {
    expect(rotatedSize(g, 90)).toEqual({ width: 4, height: 5 });
    expect(pinWorld(at(0), g, out)).toEqual({ x: 15, y: 22 });
    expect(pinWorld(at(90), g, out)).toEqual({ x: 12, y: 25 });
    expect(pinWorld(at(180), g, out)).toEqual({ x: 10, y: 22 });
    expect(pinWorld(at(270), g, out)).toEqual({ x: 12, y: 20 });
  });

  it('keeps every rotated pin inside the rotated box', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const rect = partRect(at(rot), g);
      for (const pin of g.pins) {
        const p = pinWorld(at(rot), g, pin);
        expect(p.x).toBeGreaterThanOrEqual(rect.x);
        expect(p.x).toBeLessThanOrEqual(rect.x + rect.width);
        expect(p.y).toBeGreaterThanOrEqual(rect.y);
        expect(p.y).toBeLessThanOrEqual(rect.y + rect.height);
      }
    }
  });

  it('turns the direction wires leave a pin', () => {
    expect(pinFacing(at(0), out)).toEqual({ x: 1, y: 0 });
    expect(pinFacing(at(90), out)).toEqual({ x: 0, y: 1 });
    expect(pinFacing(at(180), out)).toEqual({ x: -1, y: 0 });
    expect(pinFacing(at(270), out)).toEqual({ x: 0, y: -1 });
  });
});

describe('rectsIntersect', () => {
  it('detects overlap but not touching edges', () => {
    const a = { x: 0, y: 0, width: 4, height: 4 };
    expect(rectsIntersect(a, { x: 3, y: 3, width: 2, height: 2 })).toBe(true);
    expect(rectsIntersect(a, { x: 4, y: 0, width: 2, height: 2 })).toBe(false);
  });
});

describe('routeWire', () => {
  const right = { x: 1, y: 0 };
  const left = { x: -1, y: 0 };
  const orthogonal = (pts: { x: number; y: number }[]) =>
    pts.slice(1).every((p, i) => p.x === pts[i]!.x || p.y === pts[i]!.y);

  it('runs a straight line between aligned pins', () => {
    expect(routeWire({ x: 0, y: 2 }, right, { x: 10, y: 2 }, left)).toEqual([
      { x: 0, y: 2 },
      { x: 10, y: 2 },
    ]);
  });

  it('turns once in the middle for offset pins', () => {
    const route = routeWire({ x: 0, y: 0 }, right, { x: 10, y: 4 }, left);
    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 10, y: 4 },
    ]);
  });

  it('loops around when the target is behind the source', () => {
    const route = routeWire({ x: 10, y: 0 }, right, { x: 0, y: 0 }, left);
    expect(orthogonal(route)).toBe(true);
    expect(route[0]).toEqual({ x: 10, y: 0 });
    expect(route.at(-1)).toEqual({ x: 0, y: 0 });
    expect(Math.max(...route.map((p) => p.y))).toBe(3);
  });

  it('stays orthogonal for rotated pins and the cursor', () => {
    expect(
      orthogonal(routeWire({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 7, y: 9 }, { x: 0, y: -1 })),
    ).toBe(true);
    expect(orthogonal(routeWire({ x: 0, y: 0 }, right, { x: 3.3, y: 7.1 }, { x: 0, y: 0 }))).toBe(
      true,
    );
  });
});

describe('simplify', () => {
  it('removes duplicates and collinear midpoints', () => {
    expect(
      simplify([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
    ]);
  });
});

describe('findFreeSpot', () => {
  it('keeps the spot when it is free, and moves to the nearest free one otherwise', () => {
    const r = { x: 0, y: 0, width: 4, height: 4 };
    expect(findFreeSpot(r, [])).toEqual({ x: 0, y: 0 });
    const spot = findFreeSpot(r, [{ x: 0, y: 0, width: 4, height: 4 }]);
    // Clear of the other part by the placement gap on every side.
    expect(rectsIntersect({ ...r, ...spot }, { x: -3, y: -2, width: 10, height: 8 })).toBe(false);
  });
});

describe('routing regressions (editor review)', () => {
  const right = { x: 1, y: 0 };
  const left = { x: -1, y: 0 };

  it('never doubles back between close pins', () => {
    const route = routeWire({ x: 17, y: 2 }, right, { x: 18, y: 5 }, left);
    const xs = route.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(route[0]).toEqual({ x: 17, y: 2 });
    expect(route.at(-1)).toEqual({ x: 18, y: 5 });
  });

  it('moves a wire of another signal to a free lane instead of sharing a run', () => {
    const routes = routeWires([
      {
        id: 'w1',
        source: 'a',
        target: 'x',
        start: { x: 0, y: 0 },
        startDir: right,
        end: { x: 10, y: 4 },
        endDir: left,
      },
      {
        id: 'w2',
        source: 'b',
        target: 'y',
        start: { x: 0, y: 2 },
        startDir: right,
        end: { x: 10, y: 6 },
        endDir: left,
      },
    ]);
    const w1 = routes.get('w1')!;
    const w2 = routes.get('w2')!;
    expect(w1[1]!.x).not.toBe(w2[1]!.x);
  });

  it('lets wires of the same signal share runs', () => {
    const routes = routeWires([
      {
        id: 'w1',
        source: 'a',
        target: 'x',
        start: { x: 0, y: 0 },
        startDir: right,
        end: { x: 10, y: 4 },
        endDir: left,
      },
      {
        id: 'w2',
        source: 'a',
        target: 'y',
        start: { x: 0, y: 0 },
        startDir: right,
        end: { x: 10, y: 6 },
        endDir: left,
      },
    ]);
    expect(routes.get('w1')![1]).toEqual(routes.get('w2')![1]);
  });
});

describe('branchPoint', () => {
  it('finds where a second route leaves a shared trunk', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 10, y: 4 },
    ];
    const b = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 8 },
      { x: 10, y: 8 },
    ];
    expect(branchPoint(a, b)).toEqual({ at: { x: 5, y: 4 }, distance: 9 });
  });

  it('is the start point when the routes split immediately', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ];
    const b = [
      { x: 0, y: 0 },
      { x: 0, y: 5 },
    ];
    expect(branchPoint(a, b)).toEqual({ at: { x: 0, y: 0 }, distance: 0 });
  });
});

describe('routeWires: keeping signals apart (playtest)', () => {
  const right = { x: 1, y: 0 };
  const left = { x: -1, y: 0 };

  it('moves a wire whose corner would sit on another signal (a fake T-junction)', () => {
    const routes = routeWires([
      // w1 turns at x=14; w2's natural route would end its run exactly on w1's corner.
      {
        id: 'w1',
        source: 'a',
        target: 'x',
        start: { x: 3, y: 1 },
        startDir: right,
        end: { x: 25, y: 5 },
        endDir: left,
      },
      {
        id: 'w2',
        source: 'b',
        target: 'y',
        start: { x: 3, y: 5 },
        startDir: right,
        end: { x: 25, y: 7 },
        endDir: left,
      },
    ]);
    const w1 = routes.get('w1')!;
    const w2 = routes.get('w2')!;
    const touches = w2.some((p) => w1.some((q) => q.x === p.x && q.y === p.y));
    expect(touches).toBe(false);
  });

  it('steers a wire around a part in its way when a lane allows', () => {
    const part = { x: 8, y: -2, width: 4, height: 8 };
    const route = routeWires(
      [
        {
          id: 'w1',
          source: 'a',
          target: 'x',
          start: { x: 0, y: 0 },
          startDir: right,
          end: { x: 20, y: 4 },
          endDir: left,
        },
      ],
      [part],
    ).get('w1')!;
    const crosses = route.slice(1).some((p, i) => {
      const a = route[i]!;
      return a.x === p.x && a.x > part.x && a.x < part.x + part.width;
    });
    expect(crosses).toBe(false);
  });
});
