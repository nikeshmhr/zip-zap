import { describe, expect, it } from 'vitest';
import type { Selection } from '../../src/state/editorStore.ts';
import type { HitTarget } from '../../src/ui/editor/hitTest.ts';
import type { InteractionContext, Mode } from '../../src/ui/editor/interaction.ts';
import {
  IDLE,
  cancel,
  normalizeRect,
  pointerDown,
  pointerMove,
  pointerUp,
} from '../../src/ui/editor/interaction.ts';

const ctx = (
  selection: Selection = { components: [], wires: [] },
  inRect: string[] = [],
): InteractionContext => ({
  selection,
  partsInRect: () => inRect,
  wiresBetween: (ids) => (ids.includes('p1') && ids.includes('p2') ? ['w12'] : []),
  // One input pin, p9.a at (20, 20), snaps within one unit.
  nearestPin: (world, dir) =>
    dir === 'in' && Math.hypot(world.x - 20, world.y - 20) <= 1
      ? { ref: { comp: 'p9', pin: 'a' }, dir: 'in' }
      : undefined,
});

const part = (id: string): HitTarget => ({ type: 'part', id });
const canvas: HitTarget = { type: 'canvas' };
const pin = (comp: string, p: string, dir: 'in' | 'out'): HitTarget => ({
  type: 'pin',
  ref: { comp, pin: p },
  dir,
});
const at = (x: number, y: number, hit: HitTarget = canvas, additive = false) => ({
  hit,
  world: { x, y },
  screen: { x: x * 16, y: y * 16 },
  additive,
});

describe('selecting', () => {
  it('pressing an unselected part selects only it', () => {
    const [mode, effects] = pointerDown(
      IDLE,
      at(1, 1, part('p1')),
      ctx({ components: ['p2'], wires: ['w1'] }),
    );
    expect(mode.kind).toBe('pressing');
    expect(effects).toEqual([{ type: 'select', selection: { components: ['p1'], wires: [] } }]);
  });

  it('shift-press adds a part at once; shift-click on a selected part removes it on release', () => {
    const sel = { components: ['p1', 'p2'], wires: [] };
    expect(pointerDown(IDLE, at(1, 1, part('p3'), true), ctx(sel))[1]).toEqual([
      { type: 'select', selection: { components: ['p1', 'p2', 'p3'], wires: [] } },
    ]);
    const [pressing, down] = pointerDown(IDLE, at(1, 1, part('p2'), true), ctx(sel));
    expect(down).toEqual([]);
    expect(pointerUp(pressing, at(1, 1, part('p2')), ctx(sel))[1]).toEqual([
      { type: 'select', selection: { components: ['p1'], wires: [] } },
    ]);
  });

  it('shift-dragging an already selected part moves the whole selection', () => {
    const sel = { components: ['p1', 'p3'], wires: [] };
    const [pressing] = pointerDown(IDLE, at(0, 0, part('p3'), true), ctx(sel));
    const [mode, effects] = pointerMove(pressing, at(2, 0), ctx(sel));
    expect(effects).toEqual([
      { type: 'beginGesture' },
      { type: 'moveParts', ids: ['p1', 'p3'], delta: { x: 2, y: 0 } },
    ]);
    expect(pointerUp(mode, at(2, 0), ctx(sel))[1]).toEqual([{ type: 'endGesture' }]); // still selected
  });

  it('clicking one part of a multi-selection narrows to it on release', () => {
    const sel = { components: ['p1', 'p2'], wires: [] };
    const [pressing, down] = pointerDown(IDLE, at(1, 1, part('p1')), ctx(sel));
    expect(down).toEqual([]);
    const [mode, up] = pointerUp(pressing, at(1, 1, part('p1')), ctx(sel));
    expect(mode).toBe(IDLE);
    expect(up).toEqual([{ type: 'select', selection: { components: ['p1'], wires: [] } }]);
  });

  it('pressing a wire selects it', () => {
    const [mode, effects] = pointerDown(IDLE, at(0, 0, { type: 'wire', id: 'w3' }), ctx());
    expect(mode).toBe(IDLE);
    expect(effects).toEqual([{ type: 'select', selection: { components: [], wires: ['w3'] } }]);
  });

  it('dragging on the canvas box-selects, clearing the selection first', () => {
    const [box, down] = pointerDown(IDLE, at(0, 0), ctx({ components: ['p9'], wires: [] }));
    expect(down).toEqual([{ type: 'select', selection: { components: [], wires: [] } }]);
    const [moved, effects] = pointerMove(box, at(5, 5), ctx(undefined, ['p1', 'p2']));
    expect(moved).toMatchObject({ kind: 'boxSelecting', current: { x: 5, y: 5 } });
    expect(effects).toEqual([
      { type: 'select', selection: { components: ['p1', 'p2'], wires: ['w12'] } },
    ]);
    expect(pointerUp(moved, at(5, 5), ctx())[0]).toBe(IDLE);
  });

  it('shift box-select adds to the existing selection', () => {
    const [box] = pointerDown(IDLE, at(0, 0, canvas, true), ctx({ components: ['p9'], wires: [] }));
    const [, effects] = pointerMove(box, at(5, 5), ctx(undefined, ['p1']));
    expect(effects).toEqual([
      { type: 'select', selection: { components: ['p9', 'p1'], wires: [] } },
    ]);
  });

  it('normalises rectangles drawn in any direction', () => {
    expect(normalizeRect({ x: 5, y: 1 }, { x: 2, y: 4 })).toEqual({
      x: 2,
      y: 1,
      width: 3,
      height: 3,
    });
  });
});

describe('dragging', () => {
  const sel = { components: ['p1', 'p2'], wires: [] };

  it('waits for the drag threshold, then moves the whole selection in whole grid steps', () => {
    let [mode] = pointerDown(IDLE, at(10, 10, part('p1')), ctx(sel));
    let effects;
    [mode, effects] = pointerMove(mode, { ...at(10.1, 10), screen: { x: 161, y: 160 } }, ctx(sel));
    expect(mode.kind).toBe('pressing');
    expect(effects).toEqual([]);

    [mode, effects] = pointerMove(mode, at(11.6, 10.2), ctx(sel));
    expect(mode).toMatchObject({ kind: 'dragging', ids: ['p1', 'p2'] });
    expect(effects).toEqual([
      { type: 'beginGesture' },
      { type: 'moveParts', ids: ['p1', 'p2'], delta: { x: 2, y: 0 } },
    ]);

    [mode, effects] = pointerMove(mode, at(11.7, 10.3), ctx(sel));
    expect(effects).toEqual([]); // same grid cell

    [mode, effects] = pointerMove(mode, at(9, 13), ctx(sel));
    expect(effects).toEqual([{ type: 'moveParts', ids: ['p1', 'p2'], delta: { x: -3, y: 3 } }]);

    const [end, endEffects] = pointerUp(mode, at(9, 13), ctx(sel));
    expect(end).toBe(IDLE);
    expect(endEffects).toEqual([{ type: 'endGesture' }]);
  });

  it('cancelling a drag abandons it', () => {
    const dragging: Mode = {
      kind: 'dragging',
      ids: ['p1'],
      start: { x: 0, y: 0 },
      applied: { x: 1, y: 0 },
    };
    expect(cancel(dragging)).toEqual([IDLE, [{ type: 'cancelGesture' }]]);
  });
});

describe('wiring', () => {
  it('drags from a pin to another pin to request a connection', () => {
    const [wiring] = pointerDown(IDLE, at(1, 1, pin('p1', 'out', 'out')), ctx());
    expect(wiring).toMatchObject({
      kind: 'wiring',
      from: { ref: { comp: 'p1', pin: 'out' }, dir: 'out' },
    });
    const [moved] = pointerMove(wiring, at(4, 4), ctx());
    expect(moved).toMatchObject({ cursor: { x: 4, y: 4 } });
    const [end, effects] = pointerUp(moved, at(5, 5, pin('p2', 'a', 'in')), ctx());
    expect(end).toBe(IDLE);
    expect(effects).toEqual([
      {
        type: 'connect',
        from: { ref: { comp: 'p1', pin: 'out' }, dir: 'out' },
        to: { ref: { comp: 'p2', pin: 'a' }, dir: 'in' },
      },
    ]);
  });

  it('snaps to a nearby pin, showing it as the target while dragging', () => {
    const [wiring] = pointerDown(IDLE, at(1, 1, pin('p1', 'out', 'out')), ctx());
    const [near] = pointerMove(wiring, at(20.6, 19.7), ctx());
    expect(near).toMatchObject({ target: { ref: { comp: 'p9', pin: 'a' }, dir: 'in' } });
    const [, effects] = pointerUp(near, at(20.6, 19.7), ctx());
    expect(effects).toEqual([
      {
        type: 'connect',
        from: { ref: { comp: 'p1', pin: 'out' }, dir: 'out' },
        to: { ref: { comp: 'p9', pin: 'a' }, dir: 'in' },
      },
    ]);
  });

  it('dropping on empty canvas or the starting pin does nothing', () => {
    const [wiring] = pointerDown(IDLE, at(1, 1, pin('p1', 'out', 'out')), ctx());
    expect(pointerUp(wiring, at(9, 9), ctx())[1]).toEqual([]);
    expect(pointerUp(wiring, at(1, 1, pin('p1', 'out', 'out')), ctx())[1]).toEqual([]);
  });
});

describe('input switches', () => {
  it('a click on a switch toggles it', () => {
    const [pressing] = pointerDown(IDLE, at(0, 0, { type: 'toggle', name: 'A' }), ctx());
    expect(pointerUp(pressing, at(0, 0), ctx())).toEqual([
      IDLE,
      [{ type: 'toggleInput', name: 'A' }],
    ]);
  });
});

describe('dragging a bend point', () => {
  it('selects its wire, moves it in whole grid steps, and closes the gesture', () => {
    const [mode, down] = pointerDown(IDLE, at(5, 5, { type: 'bend', wire: 'w2', index: 1 }), ctx());
    expect(down).toEqual([
      { type: 'select', selection: { components: [], wires: ['w2'] } },
      { type: 'beginGesture' },
    ]);
    const [, moved] = pointerMove(mode, at(7.4, 2.6), ctx());
    expect(moved).toEqual([{ type: 'moveBend', wire: 'w2', index: 1, point: { x: 7, y: 3 } }]);
    expect(pointerUp(mode, at(7, 3), ctx())).toEqual([IDLE, [{ type: 'endGesture' }]]);
    expect(cancel(mode)).toEqual([IDLE, [{ type: 'cancelGesture' }]]);
  });
});
