/**
 * Player settings (spec §11): theme, sound and motion. Applied to <html> as data attributes
 * that the CSS reads.
 */
import { create } from 'zustand';
import type { Settings } from '../persistence/save.ts';
import { DEFAULT_SETTINGS } from '../persistence/save.ts';

export interface SettingsState {
  settings: Settings;
  update(changes: Partial<Settings>): void;
}

export const useSettings = create<SettingsState>()((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  update: (changes) => set({ settings: { ...get().settings, ...changes } }),
}));

/** Reflects settings on the document: data-theme (unless "system") and data-motion. */
export function applySettings(settings: Settings, root: HTMLElement = document.documentElement) {
  if (settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  if (settings.motion === 'reduce') root.dataset.motion = 'reduce';
  else delete root.dataset.motion;
}
