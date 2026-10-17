import { describe, expect, it } from 'vitest';
import { createCatalogue } from '../../src/content/registry.ts';
import type { LevelDef } from '../../src/content/types.ts';
import { chipKind } from '../../src/engine/model.ts';
import { STUB_CHAPTERS, STUB_LEVELS } from './stub.ts';

const catalogue = createCatalogue(STUB_CHAPTERS, STUB_LEVELS);

describe('createCatalogue', () => {
  it('resolves explicit, unlocked and excluded toolboxes', () => {
    expect(catalogue.toolbox('0.1')).toEqual(['power', 'relayNC']);
    expect(catalogue.toolbox('1.1')).toEqual(['const0', 'const1', 'nand']);
    expect(catalogue.toolbox('1.2')).toEqual(['const1', 'nand', 'chip:not']);
  });

  it('derives chips from the levels that unlock them, with the level pins', () => {
    expect(catalogue.chips.map((c) => [c.id, c.name, c.inputs, c.outputs])).toEqual([
      ['not', 'NOT', ['A'], ['OUT']],
    ]);
    const notDef = catalogue.resolve(chipKind('not'))!;
    expect(notDef.step([1], notDef.init()).outputs).toEqual([0]);
  });

  it('builds validation options and test specs per level', () => {
    expect([...catalogue.validateOptions('1.2').allowedKinds!]).toEqual([
      'const1',
      'nand',
      'chip:not',
    ]);
    expect(catalogue.testSpec('1.1')).toMatchObject({ inputs: ['A'], outputs: ['OUT'] });
  });

  it('names components and walks levels in order', () => {
    expect(catalogue.displayName('nand')).toBe('NAND');
    expect(catalogue.displayName(chipKind('not'))).toBe('NOT');
    expect(catalogue.displayName('relayNC')).toBe('Relay (normally closed)');
    expect(catalogue.next('0.1')?.id).toBe('1.1');
    expect(catalogue.next('1.2')).toBeUndefined();
    expect(() => catalogue.level('9.9')).toThrow(/Unknown level/);
  });

  it('builds reference circuits with the level IO', () => {
    const circuit = catalogue.referenceCircuit('1.2');
    expect(circuit.components.filter((c) => c.kind === 'in').map((c) => c.label)).toEqual([
      'A',
      'B',
    ]);
  });

  it('rejects authoring mistakes', () => {
    const [l0, l1, l2] = STUB_LEVELS as [LevelDef, LevelDef, LevelDef];
    expect(() => createCatalogue(STUB_CHAPTERS, [l0, l0])).toThrow(/Duplicate level id/);
    expect(() => createCatalogue(STUB_CHAPTERS, [l1, l0])).toThrow(/out of chapter order/);
    expect(() => createCatalogue(STUB_CHAPTERS, [l0, { ...l1, chapter: 7 }])).toThrow(
      /unknown chapter/,
    );
    expect(() => createCatalogue(STUB_CHAPTERS, [l0, l1, { ...l2, unlocks: l1.unlocks }])).toThrow(
      /unlocked twice/,
    );
  });
});
