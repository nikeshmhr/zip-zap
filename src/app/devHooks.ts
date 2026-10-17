/**
 * Development-only hooks for end-to-end tests, e.g. loading a circuit the editor wouldn't let a
 * player draw (like a short from an old save). Never included in production builds.
 */
import { catalogue } from '../content/index.ts';
import type { Circuit } from '../engine/model.ts';
import { levelEditor, useProgress } from '../state/session.ts';
import { solveMetrics } from '../ui/level/solve.ts';
import { sounds } from '../ui/sound.ts';

declare global {
  interface Window {
    __zipzap?: {
      loadLevelCircuit(id: string, circuit: Circuit): void;
      /** Marks every level before `id` solved with its reference design, unlocking `id`. */
      solveBefore(id: string): void;
      /** Sounds played recently. */
      soundLog(): readonly string[];
      /** Loads a level's reference solution into its editor. */
      loadReference(id: string): void;
    };
  }
}

export function installDevHooks() {
  window.__zipzap = {
    loadLevelCircuit: (id, circuit) =>
      levelEditor(id, catalogue.canvasIo(id)).getState().load(circuit),
    soundLog: () => [...sounds.log],
    loadReference: (id) =>
      levelEditor(id, catalogue.canvasIo(id)).getState().load(catalogue.referenceCircuit(id)),
    solveBefore: (id) => {
      for (const level of catalogue.levels) {
        if (level.id === id) break;
        const design = catalogue.referenceCircuit(level.id);
        useProgress.getState().markSolved(level.id, solveMetrics(level, design), design);
      }
    },
  };
}
