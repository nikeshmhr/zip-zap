import { describe, expect, it } from 'vitest';
import { catalogue } from '../../src/content/index.ts';
import { levelStatuses, nextUnsolved, unlockedKinds } from '../../src/state/unlocks.ts';

const order = ['0.1', '0.2', '1.1', '1.2'];
const solvedSet =
  (...ids: string[]) =>
  (id: string) =>
    ids.includes(id);

describe('levelStatuses', () => {
  it('opens only the first level on a fresh game', () => {
    expect([...levelStatuses(order, solvedSet())]).toEqual([
      ['0.1', 'available'],
      ['0.2', 'locked'],
      ['1.1', 'locked'],
      ['1.2', 'locked'],
    ]);
  });

  it('opens levels in order within a chapter', () => {
    expect(levelStatuses(order, solvedSet('0.1')).get('0.2')).toBe('available');
    expect(levelStatuses(order, solvedSet('0.1')).get('1.1')).toBe('locked');
  });

  it('opens the next chapter only when the previous one is complete', () => {
    const statuses = levelStatuses(order, solvedSet('0.1', '0.2'));
    expect(statuses.get('1.1')).toBe('available');
    expect(statuses.get('1.2')).toBe('locked');
  });

  it('keeps solved levels open', () => {
    expect(levelStatuses(order, solvedSet('0.1', '0.2', '1.1')).get('0.1')).toBe('solved');
  });

  it('works over the real catalogue', () => {
    const ids = catalogue.levels.map((l) => l.id);
    const statuses = levelStatuses(ids, solvedSet());
    expect([...statuses.values()].filter((s) => s === 'available')).toHaveLength(1);
    expect(nextUnsolved(ids, solvedSet('0.1'))).toBe('0.2');
    expect(nextUnsolved(ids, () => true)).toBeUndefined();
  });
});

describe('unlockedKinds', () => {
  it('lists what solved levels unlocked, in play order', () => {
    expect(unlockedKinds(catalogue.levels, solvedSet('0.4', '1.1', '1.2'))).toEqual([
      'nand',
      'chip:not',
      'chip:and',
    ]);
  });
});

describe('progress store', () => {
  it('records solves with best metrics and replaces all progress', async () => {
    const { useProgress } = await import('../../src/state/session.ts');
    const empty = { components: [], wires: [] };
    const store = useProgress.getState();
    store.replaceAll({});
    expect(store.markSolved('1.1', { count: 2, delay: 2 }, empty)).toBe(true);
    expect(useProgress.getState().markSolved('1.1', { count: 3, delay: 1 }, empty)).toBe(true);
    expect(useProgress.getState().get('1.1').best).toEqual({ count: 2, delay: 1 });
    expect(useProgress.getState().markSolved('1.1', { count: 4, delay: 5 }, empty)).toBe(false);
    useProgress.getState().replaceAll({});
    expect(useProgress.getState().get('1.1').solved).toBe(false);
  });

  it('records a solve without metrics but never invents a best of 0', async () => {
    const { useProgress } = await import('../../src/state/session.ts');
    const empty = { components: [], wires: [] };
    useProgress.getState().replaceAll({});
    expect(useProgress.getState().markSolved('1.2', null, empty)).toBe(false);
    expect(useProgress.getState().get('1.2')).toMatchObject({ solved: true, design: empty });
    expect(useProgress.getState().get('1.2').best).toBeUndefined();
    useProgress.getState().markSolved('1.2', { count: 2, delay: 2 }, empty);
    expect(useProgress.getState().get('1.2').best).toEqual({ count: 2, delay: 2 });
  });
});
