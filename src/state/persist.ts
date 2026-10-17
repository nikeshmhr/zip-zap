/**
 * Connects game state to the save (plan §7): load and hydrate at start-up, then write a
 * debounced snapshot whenever progress, settings or any circuit changes.
 */
import { create } from 'zustand';
import type { Save } from '../persistence/save.ts';
import { CURRENT_VERSION, loadSave, writeSave } from '../persistence/save.ts';
import { allCircuits, onCircuitChange, seedCircuits, useProgress } from './session.ts';
import { useSettings } from './settings.ts';

export const AUTOSAVE_DELAY_MS = 500;

/** A message for the player about their save (e.g. it was damaged and set aside). */
export const useSaveNotice = create<{ message?: string; dismiss(): void }>()((set) => ({
  dismiss: () => set({ message: undefined }),
}));

export function hydrate(save: Save) {
  seedCircuits(save.circuits);
  useProgress.getState().replaceAll(save.progress);
  useSettings.setState({ settings: { ...save.settings } });
}

export function collectSave(): Save {
  return {
    version: CURRENT_VERSION,
    progress: useProgress.getState().levels,
    circuits: allCircuits(),
    settings: useSettings.getState().settings,
  };
}

export interface Autosave {
  /** Writes now if a save is pending. */
  flush(): void;
  stop(): void;
}

export function startAutosave(storage: Storage, delay = AUTOSAVE_DELAY_MS): Autosave {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let warned = false;
  let stopped = false;
  const write = () => {
    timer = undefined;
    const ok = writeSave(storage, collectSave());
    if (!ok && !warned) {
      warned = true;
      useSaveNotice.setState({
        message:
          "Your browser isn't letting Zip Zap save progress. Export your save from Settings to keep it.",
      });
    }
  };
  const schedule = () => {
    if (stopped) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(write, delay);
  };
  const unsubscribers = [
    useProgress.subscribe(schedule),
    useSettings.subscribe(schedule),
    onCircuitChange(schedule),
  ];
  return {
    flush: () => {
      if (stopped || timer === undefined) return;
      clearTimeout(timer);
      write();
    },
    stop: () => {
      // Once stopped, nothing more is written, not even by a later flush (e.g. on pagehide).
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      unsubscribers.forEach((u) => u());
    },
  };
}

/** Loads the save, hydrates state and starts autosaving. */
export function initPersistence(storage: Storage): Autosave {
  const { save, notice } = loadSave(storage);
  hydrate(save);
  if (notice) {
    useSaveNotice.setState({
      message: `${notice.message} A copy was kept, and the game has started fresh.`,
    });
  }
  return startAutosave(storage);
}
