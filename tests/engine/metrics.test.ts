import { describe, expect, it, vi } from 'vitest';
import { buildCircuit } from '../../src/engine/builder.ts';
import type { ChipDef } from '../../src/engine/chips.ts';
import { createResolver } from '../../src/engine/chips.ts';
import type { MetricsCache } from '../../src/engine/metrics.ts';
import { computeMetrics } from '../../src/engine/metrics.ts';
import type { Circuit } from '../../src/engine/model.ts';
import { chipKind, toBit } from '../../src/engine/model.ts';
import { and, nand, not, or, xor } from './helpers.ts';

const io2 = { inputs: ['a', 'b'], outputs: ['out'] };

/** Player designs for the chips used below. */
const designs: Record<string, Circuit> = {
  not: buildCircuit({ inputs: ['a'], outputs: ['out'] }, (b) => b.wire(not(b, 'a'), 'out')),
  and: buildCircuit(io2, (b) => b.wire(and(b, 'a', 'b'), 'out')),
  or: buildCircuit(io2, (b) => b.wire(or(b, 'a', 'b'), 'out')),
  xor: buildCircuit(io2, (b) => b.wire(xor(b, 'a', 'b'), 'out')),
};

const gateChip = (id: string, fn: (a: number, b: number) => boolean): ChipDef => ({
  id,
  name: id.toUpperCase(),
  inputs: ['a', 'b'],
  outputs: ['out'],
  behavior: { kind: 'combinational', fn: ({ a = 0, b = 0 }) => ({ out: toBit(fn(a, b)) }) },
});

const resolver = createResolver([
  gateChip('and', (a, b) => !!(a && b)),
  gateChip('or', (a, b) => !!(a || b)),
  gateChip('xor', (a, b) => a !== b),
]);

const lookup = (id: string) => designs[id];

describe('computeMetrics: primitives', () => {
  it('NOT is 1 NAND with delay 1', () => {
    expect(computeMetrics(designs.not!, resolver, lookup)).toEqual({
      relays: 0,
      nands: 1,
      delay: 1,
    });
  });

  it('XOR from NAND is 4 NANDs with delay 3', () => {
    expect(computeMetrics(designs.xor!, resolver, lookup)).toEqual({
      relays: 0,
      nands: 4,
      delay: 3,
    });
  });

  it('counts relays separately (relay NAND: 2 relays, delay 1)', () => {
    const circuit = buildCircuit(io2, (b) => {
      const p = b.add('power');
      const r1 = b.add('relayNC');
      const r2 = b.add('relayNC');
      b.wire(p.out('out'), r1.in('in'));
      b.wire(p.out('out'), r2.in('in'));
      b.wire('a', r1.in('coil'));
      b.wire('b', r2.in('coil'));
      b.wire(r1.out('out'), 'out');
      b.wire(r2.out('out'), 'out');
    });
    expect(computeMetrics(circuit, resolver, lookup)).toEqual({ relays: 2, nands: 0, delay: 1 });
  });

  it('a direct wire has delay 0', () => {
    const circuit = buildCircuit(io2, (b) => b.wire('a', 'out'));
    expect(computeMetrics(circuit, resolver, lookup)).toEqual({ relays: 0, nands: 0, delay: 0 });
  });
});

describe('computeMetrics: nested chips', () => {
  /** Full adder from chips: S = (a⊕b)⊕c, C = ab + (a⊕b)c. */
  const fullAdder = buildCircuit({ inputs: ['a', 'b', 'c'], outputs: ['s', 'cout'] }, (b) => {
    const x1 = b.add(chipKind('xor'));
    const x2 = b.add(chipKind('xor'));
    const a1 = b.add(chipKind('and'));
    const a2 = b.add(chipKind('and'));
    const o = b.add(chipKind('or'));
    b.wire('a', x1.in('a'));
    b.wire('b', x1.in('b'));
    b.wire(x1.out('out'), x2.in('a'));
    b.wire('c', x2.in('b'));
    b.wire(x2.out('out'), 's');
    b.wire('a', a1.in('a'));
    b.wire('b', a1.in('b'));
    b.wire(x1.out('out'), a2.in('a'));
    b.wire('c', a2.in('b'));
    b.wire(a1.out('out'), o.in('a'));
    b.wire(a2.out('out'), o.in('b'));
    b.wire(o.out('out'), 'cout');
  });

  it('counts NANDs through chip designs and sums chip delays along the worst path', () => {
    // 2 XOR (4 each) + 2 AND (2 each) + OR (3) = 15 NANDs.
    // Worst path: XOR (3) → AND (2) → OR (2) = 7.
    expect(computeMetrics(fullAdder, resolver, lookup)).toEqual({ relays: 0, nands: 15, delay: 7 });
  });

  it('memoises chip analysis in the shared cache', () => {
    const spy = vi.fn(lookup);
    const cache: MetricsCache = new Map();
    computeMetrics(fullAdder, resolver, spy, cache);
    computeMetrics(fullAdder, resolver, spy, cache);
    expect(spy.mock.calls.map(([id]) => id).sort()).toEqual(['and', 'or', 'xor']);
    expect(cache.get('xor')).toEqual({ relays: 0, nands: 4, delay: 3 });
  });

  it('is unknown (null) when a chip has no design', () => {
    expect(
      computeMetrics(fullAdder, resolver, (id) => (id === 'or' ? undefined : lookup(id))),
    ).toBeNull();
  });
});

describe('computeMetrics: feedback', () => {
  it('ignores a stray loop that reaches no output when computing delay', () => {
    const circuit = buildCircuit(io2, (b) => {
      b.wire(not(b, 'a'), 'out');
      const stray = b.add('nand');
      b.wire(stray.out('out'), stray.in('a'));
    });
    expect(computeMetrics(circuit, resolver, lookup)).toEqual({ relays: 0, nands: 2, delay: 1 });
  });

  it('returns null rather than throwing for designs that contain each other', () => {
    const r = createResolver([gateChip('x', () => true), gateChip('y', () => true)]);
    const uses = (id: string) =>
      buildCircuit(io2, (b) => {
        const g = b.add(chipKind(id));
        b.wire('a', g.in('a'));
        b.wire(g.out('out'), 'out');
      });
    const designsXY: Record<string, Circuit> = { x: uses('y'), y: uses('x') };
    expect(computeMetrics(uses('x'), r, (id) => designsXY[id])).toBeNull();
  });

  it('an SR latch reports its count but no delay', () => {
    const latch = buildCircuit({ inputs: ['nS', 'nR'], outputs: ['Q'] }, (b) => {
      const top = b.add('nand');
      const bottom = b.add('nand');
      b.wire('nS', top.in('a'));
      b.wire(bottom.out('out'), top.in('b'));
      b.wire('nR', bottom.in('b'));
      b.wire(top.out('out'), bottom.in('a'));
      b.wire(top.out('out'), 'Q');
    });
    expect(computeMetrics(latch, resolver, lookup)).toEqual({ relays: 0, nands: 2 });
  });

  it('a chip whose design has feedback makes the outer delay unknown too', () => {
    const latchChip: ChipDef = {
      id: 'latch',
      name: 'Latch',
      inputs: ['a', 'b'],
      outputs: ['out'],
      behavior: { kind: 'combinational', fn: () => ({}) },
    };
    const latchDesign = buildCircuit(io2, (b) => {
      const g1 = nand(b, 'a', 'b');
      b.wire(g1, 'out');
    });
    // Give the latch design a loop.
    const g = latchDesign.components.find((c) => c.kind === 'nand')!;
    latchDesign.wires = latchDesign.wires.filter((w) => !(w.to.comp === g.id && w.to.pin === 'b'));
    latchDesign.wires.push({
      id: 'loop',
      from: { comp: g.id, pin: 'out' },
      to: { comp: g.id, pin: 'b' },
    });

    const outer = buildCircuit(io2, (b) => {
      const l = b.add(chipKind('latch'));
      b.wire('a', l.in('a'));
      b.wire(l.out('out'), 'out');
    });
    const r = createResolver([latchChip]);
    expect(computeMetrics(outer, r, (id) => (id === 'latch' ? latchDesign : undefined))).toEqual({
      relays: 0,
      nands: 1,
    });
  });
});
