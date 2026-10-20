/**
 * Development-only shortcuts for playtesting and e2e tests: load or solve a level with its
 * reference solution, reset it, or unlock levels. Used by the console hooks (devHooks.ts) and
 * the Dev popover; neither is ever included in production builds.
 */
import { catalogue } from '../content/index.ts';
import { startCircuit } from '../state/editing.ts';
import { levelEditor, useProgress } from '../state/session.ts';
import { solveMetrics } from '../ui/level/solve.ts';

const editorFor = (id: string) => levelEditor(id, catalogue.canvasIo(id));

/** Replaces a level's circuit with its reference solution (not undoable). */
export function loadSolution(id: string) {
  editorFor(id).getState().load(catalogue.referenceCircuit(id));
}

/** Loads the reference solution and records the level as solved with it. */
export function solveLevel(id: string) {
  loadSolution(id);
  const design = catalogue.referenceCircuit(id);
  useProgress.getState().markSolved(id, solveMetrics(catalogue.level(id), design), design);
}

/** Puts a level back to its empty start circuit (not undoable). */
export function resetLevel(id: string) {
  editorFor(id)
    .getState()
    .load(startCircuit(catalogue.canvasIo(id)));
}

/** Marks every level before `id` solved with its reference design, unlocking `id`. */
export function solveBefore(id: string) {
  for (const level of catalogue.levels) {
    if (level.id === id) break;
    const design = catalogue.referenceCircuit(level.id);
    useProgress.getState().markSolved(level.id, solveMetrics(level, design), design);
  }
}

/** Marks every level solved. */
export const unlockAll = () => solveBefore('end');
