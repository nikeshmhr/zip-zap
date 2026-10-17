import { beforeEach, describe, expect, it } from 'vitest';
import { catalogue } from '../../src/content/index.ts';
import { useProgress } from '../../src/state/session.ts';
import { chipDesign, solveMetrics } from '../../src/ui/level/solve.ts';

beforeEach(() => useProgress.getState().replaceAll({}));

describe('chipDesign', () => {
  it("uses the player's design for a chip", () => {
    const mine = catalogue.referenceCircuit('1.1');
    useProgress.getState().markSolved('1.1', { count: 1 }, mine);
    expect(chipDesign('not')).toBe(mine);
  });

  it('falls back to the reference design when the saved design no longer validates', () => {
    const broken = {
      components: [
        { id: 'p1', kind: 'chip:removed' as const, pos: { x: 0, y: 0 }, rot: 0 as const },
      ],
      wires: [],
    };
    useProgress.getState().markSolved('1.1', null, broken);
    expect(chipDesign('not')).toEqual(catalogue.referenceCircuit('1.1'));
    // So metrics for a level using NOT can still be computed.
    expect(solveMetrics(catalogue.level('1.2'), catalogue.referenceCircuit('1.2'))).toMatchObject({
      count: 2,
    });
  });
});
