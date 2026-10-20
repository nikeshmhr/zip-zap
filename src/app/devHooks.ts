/**
 * Development-only hooks for end-to-end tests, e.g. loading a circuit the editor wouldn't let a
 * player draw (like a short from an old save). Never included in production builds.
 */
import { catalogue } from '../content/index.ts';
import type { Circuit } from '../engine/model.ts';
import { levelEditor } from '../state/session.ts';
import { sounds } from '../ui/sound.ts';
import { loadSolution, solveBefore } from './devActions.ts';

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
    loadReference: loadSolution,
    solveBefore,
  };
}
