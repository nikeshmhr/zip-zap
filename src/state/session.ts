/**
 * Per-session game state: one editor per level (so circuits survive navigating away) and the
 * player's progress. Milestone M5 adds unlock rules and saving to the browser.
 */
import { create } from 'zustand';
import type { Metrics } from '../engine/metrics.ts';
import type { LevelIo } from '../engine/model.ts';
import { startCircuit } from './editing.ts';
import type { EditorStore } from './editorStore.ts';
import { createEditorStore } from './editorStore.ts';

const editors = new Map<string, EditorStore>();

/** The editor for a level (or the sandbox), created with the level's start circuit. */
export function levelEditor(id: string, io: LevelIo): EditorStore {
  let store = editors.get(id);
  if (!store) {
    store = createEditorStore(startCircuit(io));
    editors.set(id, store);
  }
  return store;
}

/** The player's current design for every level they've opened this session. */
export const levelCircuit = (id: string) => editors.get(id)?.getState().circuit;

export interface LevelProgress {
  solved: boolean;
  /** Best part count and best delay, which may come from different solutions. */
  best?: { count: number; delay?: number };
  /** Hints revealed so far (0–2). */
  hints: number;
  /** Whether the concept card has been shown automatically. */
  conceptSeen: boolean;
}

export interface ProgressState {
  levels: Record<string, LevelProgress>;
  get(id: string): LevelProgress;
  /** Records a solve. Returns whether either best improved (always true the first time). */
  markSolved(id: string, metrics: { count: number; delay?: number }): boolean;
  revealHint(id: string): void;
  markConceptSeen(id: string): void;
}

const EMPTY: LevelProgress = { solved: false, hints: 0, conceptSeen: false };

export const useProgress = create<ProgressState>()((set, get) => ({
  levels: {},
  get: (id) => get().levels[id] ?? EMPTY,
  markSolved: (id, metrics) => {
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
    set({ levels: { ...get().levels, [id]: { ...current, solved: true, best } } });
    return improved;
  },
  revealHint: (id) => {
    const current = get().get(id);
    set({
      levels: { ...get().levels, [id]: { ...current, hints: Math.min(2, current.hints + 1) } },
    });
  },
  markConceptSeen: (id) => {
    const current = get().get(id);
    if (current.conceptSeen) return;
    set({ levels: { ...get().levels, [id]: { ...current, conceptSeen: true } } });
  },
}));

/** Count shown to the player: relays in Chapter 0, NAND gates after (spec §9). */
export const partCount = (chapter: number, metrics: Metrics) =>
  chapter === 0 ? metrics.relays : metrics.nands;
