import { describe, expect, it } from 'vitest';
import { catalogue } from '../../src/content/index.ts';
import { computeMetrics } from '../../src/engine/metrics.ts';
import { readBus, writeBus } from '../../src/engine/model.ts';
import { contentSuite } from './harness.ts';

contentSuite('Zip Zap', catalogue);

describe('chapter 0: switches', () => {
  it('has four relay-only levels ending with the NAND unlock', () => {
    const ch0 = catalogue.levels.filter((l) => l.chapter === 0);
    expect(ch0.map((l) => l.id)).toEqual(['0.1', '0.2', '0.3', '0.4']);
    expect(catalogue.level('0.4').unlocks?.kind).toBe('nand');
  });

  it('keeps relays out of every toolbox after chapter 0', () => {
    for (const level of catalogue.levels.filter((l) => l.chapter > 0)) {
      const toolbox = catalogue.toolbox(level.id);
      expect(toolbox).not.toContain('relayNO');
      expect(toolbox).not.toContain('relayNC');
      expect(toolbox).not.toContain('power');
    }
  });
});

describe('chapter 1: gates', () => {
  it('starts from NAND and constants only', () => {
    expect(catalogue.toolbox('1.1')).toEqual(['const0', 'const1', 'nand']);
  });

  it('has a 4-NAND XOR reference, as the concept card promises', () => {
    const metrics = computeMetrics(
      catalogue.referenceCircuit('1.5'),
      catalogue.resolve,
      () => undefined,
    );
    expect(metrics).toMatchObject({ nands: 4, delay: 3 });
  });

  it('unlocks every basic gate as a chip', () => {
    expect(catalogue.chips.map((c) => c.name)).toEqual(
      expect.arrayContaining(['NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR']),
    );
  });
});

describe('chapter 2: routing', () => {
  it('turns on exactly one decoder output for every address', () => {
    const { goal } = catalogue.level('2.3');
    if (goal.kind !== 'combinational') throw new Error('decoder must be combinational');
    for (const [A1, A0] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ] as const) {
      const out = goal.fn({ A1, A0 });
      expect(Object.values(out).filter((v) => v === 1)).toHaveLength(1);
      expect(out[`Y${A1 * 2 + A0}`]).toBe(1);
    }
  });
});

describe('chapter 3: arithmetic', () => {
  it('tests every row of the 4-bit adder and subtractor', () => {
    expect(catalogue.testSpec('3.3').inputs).toHaveLength(9); // 512 rows
    expect(catalogue.testSpec('3.4').inputs).toHaveLength(8); // 256 rows
  });

  it("computes two's complement wrap-around (3 − 5 = 1110)", () => {
    const { goal } = catalogue.level('3.4');
    if (goal.kind !== 'combinational') throw new Error('subtractor must be combinational');
    const out = goal.fn({ ...writeBus('A', 4, 3), ...writeBus('B', 4, 5) });
    expect(readBus(out, 'D', 4)).toBe(0b1110);
  });

  it('builds the subtractor reference from the 4-bit adder with CIN = 1', () => {
    const circuit = catalogue.referenceCircuit('3.4');
    const adder = circuit.components.find((c) => c.kind === 'chip:adder4');
    const one = circuit.components.find((c) => c.kind === 'const1');
    expect(adder).toBeDefined();
    expect(circuit.wires).toContainEqual(
      expect.objectContaining({
        from: { comp: one!.id, pin: 'out' },
        to: { comp: adder!.id, pin: 'CIN' },
      }),
    );
  });
});
