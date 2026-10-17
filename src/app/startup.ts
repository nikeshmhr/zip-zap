/**
 * Start-up wiring: load the save before the first render, keep it saved, and apply settings.
 */
import { initPersistence } from '../state/persist.ts';
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

export function startUp() {
  const autosave = initPersistence(storage());
  // Save straight away when the tab is hidden or closed, rather than waiting for the debounce.
  window.addEventListener('pagehide', () => autosave.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autosave.flush();
  });

  applySettings(useSettings.getState().settings);
  useSettings.subscribe((state) => applySettings(state.settings));
}
