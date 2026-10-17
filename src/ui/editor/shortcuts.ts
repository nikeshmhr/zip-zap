/**
 * Editor keyboard shortcuts (spec §8, plan §6). Mapping keys to actions is pure so it can be
 * tested; the editor performs the actions.
 */

export type ShortcutAction =
  | { type: 'delete' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'duplicate' }
  | { type: 'rotate' }
  | { type: 'selectAll' }
  | { type: 'cancel' }
  | { type: 'help' }
  | { type: 'fit' }
  /** Toggle the n-th level input (0-based). */
  | { type: 'toggleInput'; index: number };

export interface KeyLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export function shortcutFor(e: KeyLike): ShortcutAction | null {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.altKey) return null;

  if (mod) {
    if (key === 'z') return { type: e.shiftKey ? 'redo' : 'undo' };
    if (key === 'y') return { type: 'redo' };
    if (key === 'd') return { type: 'duplicate' };
    if (key === 'a') return { type: 'selectAll' };
    return null;
  }

  switch (key) {
    case 'Delete':
    case 'Backspace':
      return { type: 'delete' };
    case 'Escape':
      return { type: 'cancel' };
    case 'r':
      return { type: 'rotate' };
    case '?':
      return { type: 'help' };
    case 'f':
      return { type: 'fit' };
  }
  if (/^[1-9]$/.test(key)) return { type: 'toggleInput', index: Number(key) - 1 };
  return null;
}

/** For the help panel. `mod` is ⌘ on Apple platforms and Ctrl elsewhere. */
export function shortcutList(mod: string): { keys: string; action: string }[] {
  return [
    { keys: '1 – 9', action: 'Toggle input switches' },
    { keys: 'Delete', action: 'Delete selection' },
    { keys: 'R', action: 'Rotate selection' },
    { keys: `${mod} D`, action: 'Duplicate selection' },
    { keys: `${mod} A`, action: 'Select all' },
    { keys: `${mod} Z`, action: 'Undo' },
    { keys: `${mod} ⇧ Z`, action: 'Redo' },
    { keys: 'Shift + click', action: 'Add to selection' },
    { keys: 'Space + drag', action: 'Pan (or middle-drag, or scroll)' },
    { keys: `${mod} + scroll`, action: 'Zoom (or pinch)' },
    { keys: 'F', action: 'Fit the circuit in view' },
    { keys: 'Esc', action: 'Cancel the current drag' },
    { keys: '?', action: 'Show this list' },
  ];
}

export const isApple = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
