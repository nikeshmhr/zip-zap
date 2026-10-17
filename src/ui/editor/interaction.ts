/**
 * Pointer interaction as a pure state machine (plan §6): idle → pressing → dragging, wiring,
 * or box-selecting. Each handler returns the next mode and a list of effects for the editor to
 * apply, which keeps pointer logic in one testable place. Panning is handled by the Canvas.
 */
import type { PinRef, Point } from '../../engine/model.ts';
import type { Selection } from '../../state/editorStore.ts';
import { EMPTY_SELECTION } from '../../state/editorStore.ts';
import type { Rect } from './geometry.ts';
import type { HitTarget } from './hitTest.ts';

/** Screen pixels the pointer must travel before a press becomes a drag. */
export const DRAG_THRESHOLD = 4;

export interface PinEnd {
  ref: PinRef;
  dir: 'in' | 'out';
}

export type Mode =
  | { kind: 'idle' }
  | {
      kind: 'pressing';
      target: HitTarget;
      start: Point;
      startScreen: Point;
      additive: boolean;
      /** Shift-pressed an already selected part: deselect it on release unless it's dragged. */
      deselectOnClick?: boolean;
    }
  | { kind: 'dragging'; ids: readonly string[]; start: Point; applied: Point }
  | { kind: 'wiring'; from: PinEnd; cursor: Point }
  | { kind: 'boxSelecting'; start: Point; current: Point; base: Selection };

export type Effect =
  | { type: 'select'; selection: Selection }
  | { type: 'beginGesture' }
  | { type: 'endGesture' }
  | { type: 'moveParts'; ids: readonly string[]; delta: Point }
  /** Abandon the gesture, restoring the circuit from before it started. */
  | { type: 'cancelGesture' }
  | { type: 'connect'; from: PinEnd; to: PinEnd }
  | { type: 'toggleInput'; name: string };

export interface InteractionContext {
  selection: Selection;
  /** Ids of parts whose bounds intersect the rectangle (world units). */
  partsInRect(rect: Rect): string[];
  /** Ids of wires whose both ends are on the given parts. */
  wiresBetween(components: readonly string[]): string[];
}

export interface PointerInput {
  hit: HitTarget;
  world: Point;
  screen: Point;
  /** Shift (or Cmd/Ctrl) held: add to or toggle the selection. */
  additive?: boolean;
}

export type Transition = [Mode, Effect[]];

export const IDLE: Mode = { kind: 'idle' };

const toggled = (list: readonly string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])];

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function pointerDown(mode: Mode, input: PointerInput, ctx: InteractionContext): Transition {
  if (mode.kind !== 'idle') return [mode, []];
  const { hit, world, screen, additive = false } = input;
  const { selection } = ctx;

  switch (hit.type) {
    case 'pin':
      return [{ kind: 'wiring', from: { ref: hit.ref, dir: hit.dir }, cursor: world }, []];

    case 'toggle':
      return [{ kind: 'pressing', target: hit, start: world, startScreen: screen, additive }, []];

    case 'part': {
      const pressing: Mode = {
        kind: 'pressing',
        target: hit,
        start: world,
        startScreen: screen,
        additive,
      };
      if (additive) {
        // Already selected: wait for release, so shift-dragging still moves the selection.
        if (selection.components.includes(hit.id)) {
          return [{ ...pressing, deselectOnClick: true }, []];
        }
        return [
          pressing,
          [
            {
              type: 'select',
              selection: { ...selection, components: [...selection.components, hit.id] },
            },
          ],
        ];
      }
      if (selection.components.includes(hit.id)) return [pressing, []];
      return [pressing, [{ type: 'select', selection: { components: [hit.id], wires: [] } }]];
    }

    case 'wire': {
      const next = additive
        ? { ...selection, wires: toggled(selection.wires, hit.id) }
        : { components: [], wires: [hit.id] };
      return [IDLE, [{ type: 'select', selection: next }]];
    }

    case 'canvas': {
      const base = additive ? selection : EMPTY_SELECTION;
      return [
        { kind: 'boxSelecting', start: world, current: world, base },
        additive ? [] : [{ type: 'select', selection: EMPTY_SELECTION }],
      ];
    }
  }
}

export function pointerMove(mode: Mode, input: PointerInput, ctx: InteractionContext): Transition {
  const { world, screen } = input;
  switch (mode.kind) {
    case 'pressing': {
      const distance = Math.hypot(screen.x - mode.startScreen.x, screen.y - mode.startScreen.y);
      if (mode.target.type !== 'part' || distance < DRAG_THRESHOLD) return [mode, []];
      const ids = ctx.selection.components.includes(mode.target.id)
        ? ctx.selection.components
        : [mode.target.id];
      const dragging: Mode = { kind: 'dragging', ids, start: mode.start, applied: { x: 0, y: 0 } };
      const [next, effects] = pointerMove(dragging, input, ctx);
      return [next, [{ type: 'beginGesture' }, ...effects]];
    }

    case 'dragging': {
      const total = {
        x: Math.round(world.x - mode.start.x),
        y: Math.round(world.y - mode.start.y),
      };
      const delta = { x: total.x - mode.applied.x, y: total.y - mode.applied.y };
      if (delta.x === 0 && delta.y === 0) return [mode, []];
      return [{ ...mode, applied: total }, [{ type: 'moveParts', ids: mode.ids, delta }]];
    }

    case 'wiring':
      return [{ ...mode, cursor: world }, []];

    case 'boxSelecting': {
      const components = union(
        mode.base.components,
        ctx.partsInRect(normalizeRect(mode.start, world)),
      );
      const wires = union(mode.base.wires, ctx.wiresBetween(components));
      return [{ ...mode, current: world }, [{ type: 'select', selection: { components, wires } }]];
    }

    case 'idle':
      return [mode, []];
  }
}

export function pointerUp(mode: Mode, input: PointerInput, ctx: InteractionContext): Transition {
  const { hit } = input;
  switch (mode.kind) {
    case 'pressing': {
      if (mode.target.type === 'toggle') {
        return [IDLE, [{ type: 'toggleInput', name: mode.target.name }]];
      }
      if (mode.target.type === 'part' && mode.deselectOnClick) {
        const components = toggled(ctx.selection.components, mode.target.id);
        return [IDLE, [{ type: 'select', selection: { ...ctx.selection, components } }]];
      }
      // A plain click on one part of a multi-selection selects just that part.
      if (mode.target.type === 'part' && !mode.additive && ctx.selection.components.length > 1) {
        return [IDLE, [{ type: 'select', selection: { components: [mode.target.id], wires: [] } }]];
      }
      return [IDLE, []];
    }

    case 'dragging':
      return [IDLE, [{ type: 'endGesture' }]];

    case 'wiring': {
      if (hit.type !== 'pin') return [IDLE, []];
      const to = { ref: hit.ref, dir: hit.dir };
      const same = to.ref.comp === mode.from.ref.comp && to.ref.pin === mode.from.ref.pin;
      return [IDLE, same ? [] : [{ type: 'connect', from: mode.from, to }]];
    }

    case 'boxSelecting':
    case 'idle':
      return [IDLE, []];
  }
}

/** Escape or a lost pointer: abandon any gesture (undoing a drag) and return to idle. */
export function cancel(mode: Mode): Transition {
  return [IDLE, mode.kind === 'dragging' ? [{ type: 'cancelGesture' }] : []];
}
