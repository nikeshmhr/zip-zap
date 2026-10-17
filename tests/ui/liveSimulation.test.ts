import { describe, expect, it } from 'vitest';
import { buildCircuit } from '../../src/engine/builder.ts';
import { primitiveResolver } from '../../src/engine/primitives.ts';
import { LiveSimulation } from '../../src/ui/editor/liveSimulation.ts';

const nandCircuit = buildCircuit({ inputs: ['A', 'B'], outputs: ['OUT'] }, (b) => {
  const g = b.add('nand');
  b.wire('A', g.in('a'));
  b.wire('B', g.in('b'));
  b.wire(g.out('out'), 'OUT');
});

/** SR latch from cross-coupled NANDs (active-low inputs). */
const latch = buildCircuit({ inputs: ['nS', 'nR'], outputs: ['Q'] }, (b) => {
  const top = b.add('nand');
  const bottom = b.add('nand');
  b.wire('nS', top.in('a'));
  b.wire(bottom.out('out'), top.in('b'));
  b.wire('nR', bottom.in('b'));
  b.wire(top.out('out'), bottom.in('a'));
  b.wire(top.out('out'), 'Q');
});

describe('LiveSimulation', () => {
  it('reports pin values that follow the inputs', () => {
    const live = new LiveSimulation(primitiveResolver);
    let snap = live.evaluate(nandCircuit, { A: 1, B: 0 });
    expect(snap.status).toBe('ok');
    expect(snap.pin('out:OUT', 'in')).toBe(1);
    expect(snap.pin('in:A', 'out')).toBe(1);
    snap = live.evaluate(nandCircuit, { A: 1, B: 1 });
    expect(snap.pin('out:OUT', 'in')).toBe(0);
    expect(snap.pin('c1', 'b')).toBe(1);
  });

  it('keeps state across input changes, so a latch remembers', () => {
    const live = new LiveSimulation(primitiveResolver);
    live.evaluate(latch, { nS: 1, nR: 1 });
    expect(live.evaluate(latch, { nS: 0, nR: 1 }).pin('out:Q', 'in')).toBe(1); // set
    expect(live.evaluate(latch, { nS: 1, nR: 1 }).pin('out:Q', 'in')).toBe(1); // hold
    expect(live.evaluate(latch, { nS: 1, nR: 0 }).pin('out:Q', 'in')).toBe(0); // reset
    expect(live.evaluate(latch, { nS: 1, nR: 1 }).pin('out:Q', 'in')).toBe(0); // hold
  });

  it('keeps earlier snapshots unchanged after later evaluations', () => {
    const live = new LiveSimulation(primitiveResolver);
    const first = live.evaluate(nandCircuit, { A: 1, B: 1 });
    expect(first.pin('out:OUT', 'in')).toBe(0);
    live.evaluate(nandCircuit, { A: 0, B: 0 });
    expect(first.pin('out:OUT', 'in')).toBe(0);
  });

  it('reports oscillation without hanging', () => {
    const ring = buildCircuit({ inputs: [], outputs: ['OUT'] }, (b) => {
      const g = b.add('nand');
      b.wire(g.out('out'), g.in('a'));
      b.wire(g.out('out'), g.in('b'));
      b.wire(g.out('out'), 'OUT');
    });
    expect(new LiveSimulation(primitiveResolver).evaluate(ring, {}).status).toBe('unstable');
  });

  it('flags shorts and their wires instead of simulating', () => {
    const shorted = buildCircuit({ inputs: [], outputs: ['OUT'] }, (b) => {
      b.wire(b.add('nand').out('out'), 'OUT');
      b.wire(b.add('nand').out('out'), 'OUT');
    });
    const snap = new LiveSimulation(primitiveResolver).evaluate(shorted, {});
    expect(snap.status).toBe('short');
    expect([...snap.flaggedWires].sort()).toEqual(['w1', 'w2']);
    expect(snap.pin('out:OUT', 'in')).toBe(0);
  });
});
