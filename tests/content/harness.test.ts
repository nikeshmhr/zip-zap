import { describe, expect, it } from 'vitest';
import { createCatalogue } from '../../src/content/registry.ts';
import type { LevelDef } from '../../src/content/types.ts';
import type { SequentialGoal } from '../../src/engine/testRunner.ts';
import { contentSuite, sequenceProblems } from './harness.ts';
import { STUB_CHAPTERS, STUB_LEVELS } from './stub.ts';

contentSuite('stub catalogue', createCatalogue(STUB_CHAPTERS, STUB_LEVELS));

describe('sequenceProblems', () => {
  const base = STUB_LEVELS[0]!;
  const seqLevel = (sequences: SequentialGoal['sequences']): LevelDef => ({
    ...base,
    inputs: ['D', 'LOAD', 'CLK'],
    outputs: ['Q'],
    clock: { pin: 'CLK', holdWhileHigh: ['LOAD'] },
    goal: {
      kind: 'sequential',
      model: { init: () => null, step: (_, s) => ({ outputs: {}, state: s }) },
      sequences,
    },
  });

  it('accepts well-formed sequences', () => {
    const level = seqLevel([
      [
        { set: { D: 1, LOAD: 1, CLK: 0 } },
        { set: { CLK: 1 } },
        { set: { D: 0 } },
        { set: { CLK: 0 } },
      ],
    ]);
    expect(sequenceProblems(level)).toEqual([]);
  });

  it('flags a first step that leaves inputs unset', () => {
    expect(sequenceProblems(seqLevel([[{ set: { D: 1, CLK: 0 } }]]))).toEqual([
      'sequence 0 step 0 must set every input (missing LOAD)',
    ]);
  });

  it('flags data changing with the clock, and held inputs changing while it is high', () => {
    const level = seqLevel([
      [{ set: { D: 0, LOAD: 0, CLK: 0 } }, { set: { CLK: 1, D: 1 } }, { set: { LOAD: 1 } }],
    ]);
    expect(sequenceProblems(level)).toEqual([
      'sequence 0 step 1 changes CLK together with other inputs',
      'sequence 0 step 2 changes LOAD while CLK is high',
    ]);
  });
});
