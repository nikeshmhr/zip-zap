import { describe, expect, it } from 'vitest';
import { catalogue } from '../../src/content/index.ts';
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
