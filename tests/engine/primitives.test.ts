import { describe, expect, it } from 'vitest';
import type { Bit } from '../../src/engine/model.ts';
import { PRIMITIVES, isPrimitiveKind, primitiveResolver } from '../../src/engine/primitives.ts';

const run = (kind: keyof typeof PRIMITIVES, inputs: Bit[]) => {
  const def = PRIMITIVES[kind];
  return def.step(inputs, def.init()).outputs;
};

describe('primitive truth tables', () => {
  it('nand', () => {
    expect(run('nand', [0, 0])).toEqual([1]);
    expect(run('nand', [0, 1])).toEqual([1]);
    expect(run('nand', [1, 0])).toEqual([1]);
    expect(run('nand', [1, 1])).toEqual([0]);
  });

  it('normally-open relay passes `in` only while the coil is powered', () => {
    // inputs: [coil, in]
    expect(run('relayNO', [0, 0])).toEqual([0]);
    expect(run('relayNO', [0, 1])).toEqual([0]);
    expect(run('relayNO', [1, 0])).toEqual([0]);
    expect(run('relayNO', [1, 1])).toEqual([1]);
  });

  it('normally-closed relay passes `in` unless the coil is powered', () => {
    expect(run('relayNC', [0, 0])).toEqual([0]);
    expect(run('relayNC', [0, 1])).toEqual([1]);
    expect(run('relayNC', [1, 0])).toEqual([0]);
    expect(run('relayNC', [1, 1])).toEqual([0]);
  });

  it('sources are constant', () => {
    expect(run('power', [])).toEqual([1]);
    expect(run('const1', [])).toEqual([1]);
    expect(run('const0', [])).toEqual([0]);
  });
});

describe('pin metadata', () => {
  it('only relays have wired-OR outputs', () => {
    const wiredOr = Object.values(PRIMITIVES)
      .filter((d) => d.wiredOrOutput)
      .map((d) => d.kind);
    expect(wiredOr.sort()).toEqual(['relayNC', 'relayNO']);
  });

  it('level IO is external with one pin each', () => {
    expect(PRIMITIVES.in).toMatchObject({ external: true, inputs: [], outputs: ['out'] });
    expect(PRIMITIVES.out).toMatchObject({ external: true, inputs: ['in'], outputs: [] });
  });

  it('every def is keyed by its own kind', () => {
    for (const [kind, def] of Object.entries(PRIMITIVES)) expect(def.kind).toBe(kind);
  });
});

describe('primitiveResolver', () => {
  it('resolves primitives and rejects chips', () => {
    expect(primitiveResolver('nand')).toBe(PRIMITIVES.nand);
    expect(primitiveResolver('chip:xor')).toBeUndefined();
    expect(isPrimitiveKind('chip:xor')).toBe(false);
  });
});
