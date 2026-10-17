/**
 * Start-up wiring: load the save before the first render, keep it saved, and apply settings.
 */
import type { Save } from '../persistence/save.ts';
import { writeSave } from '../persistence/save.ts';
import type { Autosave } from '../state/persist.ts';
import { initPersistence, watchOtherTabs } from '../state/persist.ts';
import { applySettings, useSettings } from '../state/settings.ts';

/** localStorage, or an in-memory stand-in where the browser blocks it (e.g. some private modes). */
function storage(): Storage {
  try {
    const s = window.localStorage;
    s.getItem('zipzap.probe');
    return s;
  } catch {
    const data = new Map<string, string>();
    return {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (k) => data.get(k) ?? null,
      key: (i) => [...data.keys()][i] ?? null,
      removeItem: (k) => void data.delete(k),
      setItem: (k, v) => void data.set(k, v),
    };
  }
}

let active: { autosave: Autosave; storage: Storage } | undefined;

export function startUp() {
  const store = storage();
  const autosave = initPersistence(store);
  active = { autosave, storage: store };
  // Save straight away when the tab is hidden or closed, rather than waiting for the debounce.
  window.addEventListener('pagehide', () => autosave.flush());
  watchOtherTabs(window, autosave, () => window.location.reload());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autosave.flush();
  });

  applySettings(useSettings.getState().settings);
  useSettings.subscribe((state) => applySettings(state.settings));
}

/**
 * Replaces the whole save (import or reset) and reloads, so every screen starts from it.
 * Autosave stops first so the closing page can't write the old state back.
 */
export function replaceSaveAndReload(save: Save): boolean {
  if (!active) return false;
  active.autosave.stop();
  if (!writeSave(active.storage, save)) return false;
  window.location.reload();
  return true;
}
