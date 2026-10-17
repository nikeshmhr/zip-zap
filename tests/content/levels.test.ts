import { describe, expect, it } from 'vitest';
import { catalogue } from '../../src/content/index.ts';
import { computeMetrics } from '../../src/engine/metrics.ts';
import { readBus, writeBus } from '../../src/engine/model.ts';
import { buildCircuit } from '../../src/engine/builder.ts';
import type { CircuitBuilder } from '../../src/engine/builder.ts';
import { runTests } from '../../src/engine/testRunner.ts';
import { CHIP, and, nand, part } from '../../src/content/recipes.ts';
import { contentSuite, describeFailures } from './harness.ts';

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

describe('chapter 4: memory', () => {
  const play = (id: string, recipe: (b: CircuitBuilder) => void) => {
    const level = catalogue.level(id);
    const circuit = buildCircuit(level, recipe, catalogue.resolve);
    return runTests(
      circuit,
      catalogue.resolve,
      catalogue.testSpec(id),
      catalogue.validateOptions(id),
    );
  };

  it('has 24 levels in total, ending with the Tiny RAM', () => {
    expect(catalogue.levels).toHaveLength(24);
    expect(catalogue.levels.at(-1)?.unlocks?.name).toBe('RAM 4×4');
  });

  it('tells a flip-flop from a latch: a D latch fails the D Flip-Flop level', () => {
    const report = play('4.3', (b) => {
      b.wire(part(b, CHIP.dLatch, { D: 'D', EN: 'CLK' }).out('Q'), 'Q');
    });
    expect(report.passed).toBe(false);
  });

  it('accepts a flip-flop built from NAND gates alone (arbitrary power-on state)', () => {
    /** Gated D latch from NANDs; returns Q. */
    const gateLatch = (
      b: CircuitBuilder,
      d: Parameters<typeof nand>[1],
      en: Parameters<typeof nand>[1],
    ) => {
      const q = b.add('nand');
      const qn = b.add('nand');
      b.wire(nand(b, d, en), q.in('a'));
      b.wire(qn.out('out'), q.in('b'));
      b.wire(nand(b, nand(b, d, d), en), qn.in('a'));
      b.wire(q.out('out'), qn.in('b'));
      return q.out('out');
    };
    const report = play('4.3', (b) => {
      const leader = gateLatch(b, 'D', nand(b, 'CLK', 'CLK'));
      b.wire(gateLatch(b, leader, 'CLK'), 'Q');
    });
    expect(report.passed, describeFailures(report)).toBe(true);
  });

  it('does not fail a register that gates the clock (MVP decision, spec §15.7)', () => {
    const report = play('4.4', (b) => {
      const ff = part(b, CHIP.dff, { D: 'D', CLK: and(b, 'CLK', 'LOAD') });
      b.wire(ff.out('Q'), 'Q');
    });
    expect(report.passed, describeFailures(report)).toBe(true);
  });

  it('fails a register that ignores LOAD', () => {
    const report = play('4.4', (b) => {
      b.wire(part(b, CHIP.dff, { D: 'D', CLK: 'CLK' }).out('Q'), 'Q');
    });
    expect(report.passed).toBe(false);
  });

  it('fails a RAM that writes every word at once', () => {
    const report = play('4.6', (b) => {
      const data = Object.fromEntries([0, 1, 2, 3].map((i) => [`D${i}`, `D${i}`]));
      const reg = part(b, CHIP.register4, { ...data, LOAD: 'LOAD', CLK: 'CLK' });
      for (const i of [0, 1, 2, 3]) b.wire(reg.out(`Q${i}`), `Q${i}`);
    });
    expect(report.passed).toBe(false);
  });
});
