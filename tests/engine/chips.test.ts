import { describe, expect, it } from 'vitest';
import type { ChipDef, SeqModel } from '../../src/engine/chips.ts';
import { chipComponentDef, createResolver } from '../../src/engine/chips.ts';
import type { Bit } from '../../src/engine/model.ts';
import { chipKind, toBit } from '../../src/engine/model.ts';
import { PRIMITIVES } from '../../src/engine/primitives.ts';
import { simulate } from './helpers.ts';

const xorChip: ChipDef = {
  id: 'xor',
  name: 'XOR',
  inputs: ['a', 'b'],
  outputs: ['out'],
  behavior: { kind: 'combinational', fn: ({ a, b }) => ({ out: toBit(a !== b) }) },
};

const dffModel: SeqModel<{ q: Bit; prevClk: Bit }> = {
  init: () => ({ q: 0, prevClk: 0 }),
  step: ({ d = 0, clk = 0 }, { q, prevClk }) => {
    const next = !prevClk && clk ? d : q;
    return { outputs: { q: next }, state: { q: next, prevClk: clk } };
  },
};

const dffChip: ChipDef = {
  id: 'dff',
  name: 'D Flip-Flop',
  inputs: ['d', 'clk'],
  outputs: ['q'],
  behavior: { kind: 'sequential', model: dffModel },
};

const resolver = createResolver([xorChip, dffChip]);

describe('chipComponentDef', () => {
  it('exposes the chip pins under its chip kind', () => {
    const def = chipComponentDef(xorChip);
    expect(def.kind).toBe('chip:xor');
    expect(def.inputs).toEqual(['a', 'b']);
    expect(def.outputs).toEqual(['out']);
    expect(def.wiredOrOutput).toBeUndefined();
  });

  it('maps pin arrays to the behaviour function and back', () => {
    const def = chipComponentDef(xorChip);
    expect(def.step([1, 0], def.init()).outputs).toEqual([1]);
    expect(def.step([1, 1], def.init()).outputs).toEqual([0]);
  });

  it('reads missing outputs as 0', () => {
    const def = chipComponentDef({
      ...xorChip,
      behavior: { kind: 'combinational', fn: () => ({}) },
    });
    expect(def.step([1, 0], null).outputs).toEqual([0]);
  });
});

describe('createResolver', () => {
  it('resolves primitives and chips', () => {
    expect(resolver('nand')).toBe(PRIMITIVES.nand);
    expect(resolver(chipKind('xor'))?.kind).toBe('chip:xor');
    expect(resolver(chipKind('nope'))).toBeUndefined();
  });

  it('rejects duplicate chip ids', () => {
    expect(() => createResolver([xorChip, xorChip])).toThrow(/Duplicate chip id "xor"/);
  });
});

describe('chips in simulation', () => {
  it('a combinational chip responds in one tick, whatever its internal depth', () => {
    const sim = simulate(
      { inputs: ['A', 'B'], outputs: ['OUT'] },
      (b) => {
        const x = b.add(chipKind('xor'));
        b.wire('A', x.in('a'));
        b.wire('B', x.in('b'));
        b.wire(x.out('out'), 'OUT');
      },
      resolver,
    );
    sim.settle();
    sim.setInputs({ A: 1 });
    expect(sim.settle()).toEqual({ stable: true, ticks: 1 });
    expect(sim.readOutputs().OUT).toBe(1);
  });

  it('a behavioural D flip-flop updates only on the rising clock edge', () => {
    const sim = simulate(
      { inputs: ['D', 'CLK'], outputs: ['Q'] },
      (b) => {
        const ff = b.add(chipKind('dff'));
        b.wire('D', ff.in('d'));
        b.wire('CLK', ff.in('clk'));
        b.wire(ff.out('q'), 'Q');
      },
      resolver,
    );
    const step = (bits: { D?: Bit; CLK?: Bit }) => {
      sim.setInputs(bits);
      expect(sim.settle().stable).toBe(true);
      return sim.readOutputs().Q;
    };
    expect(step({ D: 1, CLK: 0 })).toBe(0); // D changes, no edge
    expect(step({ CLK: 1 })).toBe(1); // rising edge captures D=1
    expect(step({ D: 0 })).toBe(1); // clock high: D ignored
    expect(step({ CLK: 0 })).toBe(1); // falling edge: no change
    expect(step({ CLK: 1 })).toBe(0); // rising edge captures D=0
  });
});
