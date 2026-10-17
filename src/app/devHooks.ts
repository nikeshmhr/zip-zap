/**
 * Development-only hooks for end-to-end tests, e.g. loading a circuit the editor wouldn't let a
 * player draw (like a short from an old save). Never included in production builds.
 */
import { catalogue } from '../content/index.ts';
import type { Circuit } from '../engine/model.ts';
import { levelEditor } from '../state/session.ts';

declare global {
  interface Window {
    __zipzap?: { loadLevelCircuit(id: string, circuit: Circuit): void };
  }
}

export function installDevHooks() {
  window.__zipzap = {
    loadLevelCircuit: (id, circuit) =>
      levelEditor(id, catalogue.canvasIo(id)).getState().load(circuit),
  };
}
