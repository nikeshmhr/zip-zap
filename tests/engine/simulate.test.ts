import { describe, expect, it } from 'vitest';
import { enumerateRows } from '../../src/engine/model.ts';
import { nand, nor, not, simulate, xor } from './helpers.ts';

describe('Simulator: combinational', () => {
  it('a chain of 3 NOTs takes exactly 3 ticks to respond', () => {
    const sim = simulate({ inputs: ['A'], outputs: ['OUT'] }, (b) => {
      b.wire(not(b, not(b, not(b, 'A'))), 'OUT');
    });
    expect(sim.settle().stable).toBe(true);
    expect(sim.readOutputs()).toEqual({ OUT: 1 });

    sim.setInputs({ A: 1 });
    expect(sim.settle()).toEqual({ stable: true, ticks: 3 });
    expect(sim.readOutputs()).toEqual({ OUT: 0 });
  });

  it('XOR from NAND is correct for every row', () => {
    const sim = simulate({ inputs: ['A', 'B'], outputs: ['OUT'] }, (b) => {
      b.wire(xor(b, 'A', 'B'), 'OUT');
    });
    for (const row of enumerateRows(['A', 'B'])) {
      sim.reset();
      sim.setInputs(row);
      expect(sim.settle().stable).toBe(true);
      expect(sim.readOutputs().OUT).toBe(row.A === row.B ? 0 : 1);
    }
  });

  it('a wire straight from input to output needs no ticks', () => {
    const sim = simulate({ inputs: ['A'], outputs: ['OUT'] }, (b) => b.wire('A', 'OUT'));
    sim.setInputs({ A: 1 });
    expect(sim.settle()).toEqual({ stable: true, ticks: 0 });
    expect(sim.readOutputs()).toEqual({ OUT: 1 });
  });

  it('unconnected inputs read OFF; unconnected outputs read OFF', () => {
    const sim = simulate({ inputs: [], outputs: ['X', 'Y'] }, (b) => {
      b.wire(b.add('nand').out('out'), 'X');
    });
    sim.settle();
    expect(sim.readOutputs()).toEqual({ X: 1, Y: 0 });
  });

  it('joined relay outputs act as OR (two NC relays in parallel = NAND)', () => {
    const sim = simulate({ inputs: ['A', 'B'], outputs: ['OUT'] }, (b) => {
      const p = b.add('power');
      const r1 = b.add('relayNC');
      const r2 = b.add('relayNC');
      b.wire(p.out('out'), r1.in('in'));
      b.wire(p.out('out'), r2.in('in'));
      b.wire('A', r1.in('coil'));
      b.wire('B', r2.in('coil'));
      b.wire(r1.out('out'), 'OUT');
      b.wire(r2.out('out'), 'OUT');
    });
    for (const row of enumerateRows(['A', 'B'])) {
      sim.reset();
      sim.setInputs(row);
      sim.settle();
      expect(sim.readOutputs().OUT).toBe(row.A && row.B ? 0 : 1);
    }
  });

  it('rejects unknown input names', () => {
    const sim = simulate({ inputs: ['A'], outputs: [] }, () => {});
    expect(() => sim.setInputs({ Z: 1 })).toThrow(/Unknown level input "Z"/);
  });
});

describe('Simulator: feedback and stability', () => {
  it('reports a ring oscillator as unstable instead of looping forever', () => {
    const sim = simulate({ inputs: [], outputs: ['OUT'] }, (b) => {
      const g = b.add('nand');
      b.wire(g.out('out'), g.in('a'));
      b.wire(g.out('out'), g.in('b'));
      b.wire(g.out('out'), 'OUT');
    });
    const result = sim.settle(50);
    expect(result).toEqual({ stable: false, ticks: 50 });
  });

  it('uses a default tick limit based on circuit size', () => {
    const sim = simulate({ inputs: [], outputs: [] }, (b) => {
      const g = b.add('nand');
      b.wire(g.out('out'), g.in('a'));
      b.wire(g.out('out'), g.in('b'));
    });
    expect(sim.settle()).toEqual({ stable: false, ticks: 64 + 4 });
  });

  /** SR latch from two cross-coupled NANDs; inputs are active-low (0 = assert). */
  const nandLatch = () =>
    simulate({ inputs: ['nS', 'nR'], outputs: ['Q'] }, (b) => {
      const top = b.add('nand');
      const bottom = b.add('nand');
      b.wire('nS', top.in('a'));
      b.wire(bottom.out('out'), top.in('b'));
      b.wire('nR', bottom.in('b'));
      b.wire(top.out('out'), bottom.in('a'));
      b.wire(top.out('out'), 'Q');
    });

  it('a NAND SR latch sets, holds, resets and holds', () => {
    const sim = nandLatch();
    const step = (bits: { nS?: 0 | 1; nR?: 0 | 1 }) => {
      sim.setInputs(bits);
      expect(sim.settle().stable).toBe(true);
      return sim.readOutputs().Q;
    };
    expect(step({ nS: 0, nR: 1 })).toBe(1); // forcing step: set
    expect(step({ nS: 1 })).toBe(1); // hold
    expect(step({ nR: 0 })).toBe(0); // reset
    expect(step({ nR: 1 })).toBe(0); // hold
  });

  it('a NAND SR latch released from both-asserted at once oscillates (metastability)', () => {
    const sim = nandLatch();
    sim.setInputs({ nS: 0, nR: 0 });
    expect(sim.settle().stable).toBe(true);
    sim.setInputs({ nS: 1, nR: 1 });
    expect(sim.settle().stable).toBe(false);
  });

  it('a NOR SR latch built from NANDs settles after a forcing step, then holds', () => {
    const sim = simulate({ inputs: ['S', 'R'], outputs: ['Q'] }, (b) => {
      // Q = NOR(R, Qn); Qn = NOR(S, Q). Build Q's gate first with a placeholder for Qn.
      const qGate = b.add('nand'); // final NOT of NOR(R, Qn): inputs tied together
      const qnOut = nor(b, 'S', qGate.out('out'));
      const orRQn = nand(b, not(b, 'R'), not(b, qnOut));
      b.wire(orRQn, qGate.in('a'));
      b.wire(orRQn, qGate.in('b'));
      b.wire(qGate.out('out'), 'Q');
    });
    const step = (bits: { S?: 0 | 1; R?: 0 | 1 }) => {
      sim.setInputs(bits);
      expect(sim.settle().stable).toBe(true);
      return sim.readOutputs().Q;
    };
    expect(step({ S: 0, R: 1 })).toBe(0); // forcing step: reset
    expect(step({ R: 0 })).toBe(0); // hold
    expect(step({ S: 1 })).toBe(1); // set
    expect(step({ S: 0 })).toBe(1); // hold
    expect(step({ R: 1 })).toBe(0); // reset
  });

  it('reset re-runs power-on: latched state is forgotten, then the circuit settles', () => {
    const sim = nandLatch();
    // Power-on with both (active-low) inputs OFF = both asserted: Q settles to 1.
    expect(sim.isStable).toBe(true);
    expect(sim.readOutputs().Q).toBe(1);
    sim.setInputs({ nS: 1, nR: 0 });
    sim.settle();
    expect(sim.readOutputs().Q).toBe(0);
    sim.reset();
    expect(sim.readOutputs().Q).toBe(1);
  });

  it('power-on resolves a symmetric latch instead of oscillating', () => {
    // NOR latch with both inputs OFF: under purely synchronous updates it would oscillate.
    const sim = simulate({ inputs: ['S', 'R'], outputs: ['Q', 'Qn'] }, (b) => {
      const q = b.add('nand');
      const qn = b.add('nand');
      // Cross-coupled NANDs fed by inverted inputs: hold state when S = R = 0.
      b.wire(not(b, 'S'), q.in('a'));
      b.wire(qn.out('out'), q.in('b'));
      b.wire(not(b, 'R'), qn.in('a'));
      b.wire(q.out('out'), qn.in('b'));
      b.wire(q.out('out'), 'Q');
      b.wire(qn.out('out'), 'Qn');
    });
    expect(sim.isStable).toBe(true);
    const { Q, Qn } = sim.readOutputs();
    expect(Q).not.toBe(Qn);
  });

  it('power-on leaves a true oscillator pending so settle reports it', () => {
    const sim = simulate({ inputs: [], outputs: [] }, (b) => {
      const g = b.add('nand');
      b.wire(g.out('out'), g.in('a'));
      b.wire(g.out('out'), g.in('b'));
    });
    expect(sim.isStable).toBe(false);
    expect(sim.settle().stable).toBe(false);
  });

  it('tick() advances one step at a time for animation', () => {
    const sim = simulate({ inputs: ['A'], outputs: ['OUT'] }, (b) => {
      b.wire(not(b, not(b, 'A')), 'OUT');
    });
    sim.settle();
    sim.setInputs({ A: 1 });
    expect(sim.tick()).toBe(true);
    expect(sim.readOutputs().OUT).toBe(0);
    expect(sim.tick()).toBe(true);
    expect(sim.readOutputs().OUT).toBe(1);
    expect(sim.isStable).toBe(true);
    expect(sim.tick()).toBe(false);
  });
});
