/**
 * Per-session game state: one editor per level (so circuits survive navigating away) and the
 * player's progress. Milestone M5 adds unlock rules and saving to the browser.
 */
import { create } from 'zustand';
import type { Metrics } from '../engine/metrics.ts';
import type { Circuit, LevelIo } from '../engine/model.ts';
import { startCircuit } from './editing.ts';
import type { EditorStore } from './editorStore.ts';
import { createEditorStore } from './editorStore.ts';

const editors = new Map<string, EditorStore>();
/** Circuits loaded from the save, used when a level's editor is first opened. */
let savedCircuits: Record<string, Circuit> = {};
const editorListeners = new Set<() => void>();

/** Seeds the circuits that editors start from (when loading a save). */
export function seedCircuits(circuits: Record<string, Circuit>) {
  savedCircuits = { ...circuits };
}

/** Whether a saved circuit still has exactly the level's pins (levels can change in updates). */
export function matchesIo(circuit: Circuit, io: LevelIo): boolean {
  const labels = (kind: 'in' | 'out') =>
    circuit.components
      .filter((c) => c.kind === kind)
      .map((c) => c.label ?? '')
      .sort()
      .join(',');
  return (
    labels('in') === [...io.inputs].sort().join(',') &&
    labels('out') === [...io.outputs].sort().join(',')
  );
}

/**
 * The editor for a level, created from the saved circuit if it still fits the level, else the
 * level's start circuit. Pass `io: null` for free-form circuits (the sandbox).
 */
export function levelEditor(id: string, io: LevelIo | null, fixedIo = true): EditorStore {
  let store = editors.get(id);
  if (!store) {
    const saved = savedCircuits[id];
    const initial =
      saved && (io === null || matchesIo(saved, io))
        ? saved
        : startCircuit(io ?? { inputs: [], outputs: [] });
    store = createEditorStore(initial, {}, { fixedIo });
    editors.set(id, store);
    store.subscribe((state, previous) => {
      if (state.circuit !== previous.circuit) editorListeners.forEach((l) => l());
    });
  }
  return store;
}

/** Calls `listener` whenever any editor's circuit changes. Returns an unsubscribe function. */
export function onCircuitChange(listener: () => void): () => void {
  editorListeners.add(listener);
  return () => editorListeners.delete(listener);
}

/** Every circuit worth saving: saved ones not opened this session, plus the open editors'. */
export function allCircuits(): Record<string, Circuit> {
  const circuits = { ...savedCircuits };
  for (const [id, store] of editors) circuits[id] = store.getState().circuit;
  return circuits;
}

/** Forgets every open editor (after resetting or importing progress). */
export function resetEditors() {
  editors.clear();
}

/** The player's current design for every level they've opened this session. */
export const levelCircuit = (id: string) => editors.get(id)?.getState().circuit;

export interface LevelProgress {
  solved: boolean;
  /** Best part count and best delay, which may come from different solutions. */
  best?: { count: number; delay?: number };
  /** The most recent solving design; it's what this level's chip contains. */
  design?: Circuit;
  /** Hints revealed so far (0–2). */
  hints: number;
  /** Whether the concept card has been shown automatically. */
  conceptSeen: boolean;
}

export interface ProgressState {
  levels: Record<string, LevelProgress>;
  get(id: string): LevelProgress;
  /** Records a solve. Returns whether either best improved (always true the first time). */
  markSolved(id: string, metrics: { count: number; delay?: number }, design: Circuit): boolean;
  revealHint(id: string): void;
  markConceptSeen(id: string): void;
  /** Replaces all progress (loading a save, importing, resetting). */
  replaceAll(levels: Record<string, LevelProgress>): void;
}

const EMPTY: LevelProgress = { solved: false, hints: 0, conceptSeen: false };

export const useProgress = create<ProgressState>()((set, get) => ({
  levels: {},
  get: (id) => get().levels[id] ?? EMPTY,
  markSolved: (id, metrics, design) => {
    const current = get().get(id);
    const old = current.best;
    const best = {
      count: old ? Math.min(old.count, metrics.count) : metrics.count,
      delay:
        metrics.delay === undefined
          ? old?.delay
          : old?.delay === undefined
            ? metrics.delay
            : Math.min(old.delay, metrics.delay),
    };
    const improved =
      !old || best.count < old.count || (best.delay ?? Infinity) < (old.delay ?? Infinity);
    set({ levels: { ...get().levels, [id]: { ...current, solved: true, best, design } } });
    return improved;
  },
  revealHint: (id) => {
    const current = get().get(id);
    set({
      levels: { ...get().levels, [id]: { ...current, hints: Math.min(2, current.hints + 1) } },
    });
  },
  replaceAll: (levels) => set({ levels }),
  markConceptSeen: (id) => {
    const current = get().get(id);
    if (current.conceptSeen) return;
    set({ levels: { ...get().levels, [id]: { ...current, conceptSeen: true } } });
  },
}));

/** Count shown to the player: relays in Chapter 0, NAND gates after (spec §9). */
export const partCount = (chapter: number, metrics: Metrics) =>
  chapter === 0 ? metrics.relays : metrics.nands;
