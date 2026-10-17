/**
 * Editor state for one circuit: the circuit, selection, undo/redo history and the live input
 * switch positions (plan §6). One store per open level or sandbox.
 *
 * History has one entry per completed gesture. Continuous gestures (dragging) wrap their
 * updates in beginGesture()/endGesture(); the intermediate updates aren't recorded.
 */
import { createStore } from 'zustand/vanilla';
import type { Bit, Bits, Circuit, ComponentKind, Point } from '../engine/model.ts';
import type { EditOptions } from './editing.ts';
import {
  addComponent,
  nextIoLabel,
  deleteItems,
  duplicateComponents,
  moveComponents,
  rotateComponents,
} from './editing.ts';
import type { ConnectResult, PinEnd, WiringContext } from './wiring.ts';
import { connect } from './wiring.ts';

export const HISTORY_LIMIT = 200;

export interface Selection {
  components: readonly string[];
  wires: readonly string[];
}

export const EMPTY_SELECTION: Selection = { components: [], wires: [] };

export interface EditorState {
  circuit: Circuit;
  selection: Selection;
  past: readonly Circuit[];
  future: readonly Circuit[];
  /** Level input switch positions, by pin name. Not part of undo history. */
  inputs: Bits;
  /** Circuit at the start of the current gesture, if one is in progress. */
  gestureBase: Circuit | null;
}

export interface EditorActions {
  /** Replaces the circuit and clears history and selection. */
  load(circuit: Circuit): void;
  /** Records the current circuit, then applies a change. No-op if nothing changes. */
  commit(change: (circuit: Circuit) => Circuit): void;
  beginGesture(): void;
  /** Applies a change without recording it; the gesture records it as one entry. */
  preview(change: (circuit: Circuit) => Circuit): void;
  endGesture(): void;
  /** Ends the gesture by restoring the circuit from before it started. */
  cancelGesture(): void;
  undo(): void;
  redo(): void;

  /** Adds a part (switches and lamps get the next free name) and selects it. */
  addPart(kind: ComponentKind, pos: Point): string;
  /** Wires two pins if the wiring rules allow it. */
  connect(a: PinEnd, b: PinEnd, ctx: WiringContext): ConnectResult;
  moveSelection(delta: Point): void;
  moveParts(ids: readonly string[], delta: Point): void;
  rotateSelection(): void;
  /** Copies the selected parts, offset by `offset` grid units (default: down-right). */
  duplicateSelection(offset?: Point): void;
  deleteSelection(): void;

  select(selection: Selection): void;
  setInput(name: string, value: Bit): void;
  toggleInput(name: string): void;
}

export type EditorStore = ReturnType<typeof createEditorStore>;

/** Drops selected ids that no longer exist. */
function pruneSelection(selection: Selection, circuit: Circuit): Selection {
  const comps = new Set(circuit.components.map((c) => c.id));
  const wires = new Set(circuit.wires.map((w) => w.id));
  const components = selection.components.filter((id) => comps.has(id));
  const kept = selection.wires.filter((id) => wires.has(id));
  return components.length === selection.components.length && kept.length === selection.wires.length
    ? selection
    : { components, wires: kept };
}

const record = (past: readonly Circuit[], circuit: Circuit) =>
  [...past, circuit].slice(-HISTORY_LIMIT);

export function createEditorStore(
  initial: Circuit,
  inputs: Bits = {},
  opts: EditOptions = { fixedIo: true },
) {
  return createStore<EditorState & EditorActions>()((set, get) => ({
    circuit: initial,
    selection: EMPTY_SELECTION,
    past: [],
    future: [],
    inputs,
    gestureBase: null,

    load: (circuit) =>
      set({ circuit, selection: EMPTY_SELECTION, past: [], future: [], gestureBase: null }),

    commit: (change) => {
      const { circuit, past, gestureBase } = get();
      const next = change(circuit);
      if (next === circuit) return;
      // Inside a gesture, the gesture records the whole change at its end.
      if (gestureBase) set({ circuit: next });
      else set({ circuit: next, past: record(past, circuit), future: [] });
    },

    beginGesture: () => set({ gestureBase: get().circuit }),

    preview: (change) => {
      const { circuit } = get();
      const next = change(circuit);
      if (next !== circuit) set({ circuit: next });
    },

    endGesture: () => {
      const { gestureBase, circuit, past } = get();
      if (!gestureBase) return;
      if (gestureBase === circuit) set({ gestureBase: null });
      else set({ gestureBase: null, past: record(past, gestureBase), future: [] });
    },

    cancelGesture: () => {
      const { gestureBase } = get();
      if (gestureBase) set({ circuit: gestureBase, gestureBase: null });
    },

    undo: () => {
      const { past, future, circuit, selection } = get();
      const previous = past.at(-1);
      if (!previous) return;
      set({
        circuit: previous,
        past: past.slice(0, -1),
        future: [circuit, ...future],
        selection: pruneSelection(selection, previous),
      });
    },

    redo: () => {
      const { past, future, circuit, selection } = get();
      const [next, ...rest] = future;
      if (!next) return;
      set({
        circuit: next,
        past: record(past, circuit),
        future: rest,
        selection: pruneSelection(selection, next),
      });
    },

    addPart: (kind, pos) => {
      let id = '';
      get().commit((circuit) => {
        const result = addComponent(
          circuit,
          kind,
          pos,
          kind === 'in' || kind === 'out' ? nextIoLabel(circuit, kind) : undefined,
        );
        id = result.id;
        return result.circuit;
      });
      set({ selection: { components: [id], wires: [] } });
      return id;
    },

    connect: (a, b, ctx) => {
      const result = connect(get().circuit, a, b, ctx);
      if (result.ok) get().commit(() => result.circuit);
      return result;
    },

    moveSelection: (delta) =>
      get().commit((c) => moveComponents(c, get().selection.components, delta, opts)),

    moveParts: (ids, delta) => get().commit((c) => moveComponents(c, ids, delta, opts)),

    rotateSelection: () => get().commit((c) => rotateComponents(c, get().selection.components)),

    duplicateSelection: (offset) => {
      let ids: string[] = [];
      get().commit((circuit) => {
        const result = duplicateComponents(circuit, get().selection.components, offset);
        ids = result.ids;
        return result.circuit;
      });
      if (ids.length > 0) set({ selection: { components: ids, wires: [] } });
    },

    deleteSelection: () => {
      const { selection } = get();
      get().commit((c) => deleteItems(c, selection.components, selection.wires, opts));
      set({ selection: pruneSelection(get().selection, get().circuit) });
    },

    select: (selection) => set({ selection }),

    setInput: (name, value) => set({ inputs: { ...get().inputs, [name]: value } }),

    toggleInput: (name) => {
      const { inputs } = get();
      set({ inputs: { ...inputs, [name]: inputs[name] ? 0 : 1 } });
    },
  }));
}
