import { describe, expect, it } from 'vitest';
import type { ComponentInstance, Rotation } from '../../src/engine/model.ts';
import { PRIMITIVES } from '../../src/engine/primitives.ts';
import { catalogue } from '../../src/content/index.ts';
import {
  partGeometry,
  partRect,
  pinFacing,
  pinWorld,
  rectsIntersect,
  rotatedSize,
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
