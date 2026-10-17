import { describe, expect, it } from 'vitest';
import { catalogue } from '../../src/content/index.ts';
import { computeMetrics } from '../../src/engine/metrics.ts';
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
