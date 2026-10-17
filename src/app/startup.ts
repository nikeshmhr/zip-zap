/**
 * Start-up wiring: load the save before the first render, keep it saved, and apply settings.
 */
import type { Save } from '../persistence/save.ts';
import { writeSave } from '../persistence/save.ts';
import type { Autosave } from '../state/persist.ts';
import { initPersistence, useSaveNotice, watchOtherTabs } from '../state/persist.ts';
import { applySettings, useSettings } from '../state/settings.ts';

/**
 * localStorage, or an in-memory stand-in where the browser blocks it (e.g. some private
 * modes). `persistent` says which, so the player can be warned.
 */
function storage(): { storage: Storage; persistent: boolean } {
  try {
    const s = window.localStorage;
    s.getItem('zipzap.probe');
    return { storage: s, persistent: true };
  } catch {
    const data = new Map<string, string>();
    const memory: Storage = {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (k) => data.get(k) ?? null,
      key: (i) => [...data.keys()][i] ?? null,
      removeItem: (k) => void data.delete(k),
      setItem: (k, v) => void data.set(k, v),
    };
    return { storage: memory, persistent: false };
  }
}

let active: { autosave: Autosave; storage: Storage } | undefined;

export function startUp() {
  const { storage: store, persistent } = storage();
  const autosave = initPersistence(store);
  active = { autosave, storage: store };
  if (!persistent) {
    useSaveNotice.setState({
      message:
        "This browser is blocking storage, so progress won't be kept after you close the tab. Export your save from Settings to keep it.",
    });
  }
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
  // Write first: if the browser refuses, autosave keeps running and nothing is lost.
  if (!writeSave(active.storage, save)) return false;
  active.autosave.stop();
  window.location.reload();
  return true;
}
