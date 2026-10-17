import { describe, expect, it } from 'vitest';
import { shortcutFor, shortcutList } from '../../src/ui/editor/shortcuts.ts';

describe('shortcutFor', () => {
  it('maps editing keys', () => {
    expect(shortcutFor({ key: 'Delete' })).toEqual({ type: 'delete' });
    expect(shortcutFor({ key: 'Backspace' })).toEqual({ type: 'delete' });
    expect(shortcutFor({ key: 'r' })).toEqual({ type: 'rotate' });
    expect(shortcutFor({ key: 'R', shiftKey: true })).toEqual({ type: 'rotate' });
    expect(shortcutFor({ key: 'Escape' })).toEqual({ type: 'cancel' });
    expect(shortcutFor({ key: '?', shiftKey: true })).toEqual({ type: 'help' });
    expect(shortcutFor({ key: 'f' })).toEqual({ type: 'fit' });
  });

  it('accepts ⌘ or Ctrl as the modifier', () => {
    expect(shortcutFor({ key: 'z', metaKey: true })).toEqual({ type: 'undo' });
    expect(shortcutFor({ key: 'z', ctrlKey: true })).toEqual({ type: 'undo' });
    expect(shortcutFor({ key: 'Z', metaKey: true, shiftKey: true })).toEqual({ type: 'redo' });
    expect(shortcutFor({ key: 'y', ctrlKey: true })).toEqual({ type: 'redo' });
    expect(shortcutFor({ key: 'd', metaKey: true })).toEqual({ type: 'duplicate' });
    expect(shortcutFor({ key: 'a', ctrlKey: true })).toEqual({ type: 'selectAll' });
  });

  it('maps digits 1–9 to input switches', () => {
    expect(shortcutFor({ key: '1' })).toEqual({ type: 'toggleInput', index: 0 });
    expect(shortcutFor({ key: '9' })).toEqual({ type: 'toggleInput', index: 8 });
    expect(shortcutFor({ key: '0' })).toBeNull();
  });

  it('ignores other keys and modified variants it does not own', () => {
    expect(shortcutFor({ key: 'x' })).toBeNull();
    expect(shortcutFor({ key: 'r', metaKey: true })).toBeNull(); // browser reload
    expect(shortcutFor({ key: 'z', altKey: true, metaKey: true })).toBeNull();
  });
});

describe('shortcutList', () => {
  it('uses the platform modifier symbol', () => {
    expect(shortcutList('⌘').find((s) => s.action === 'Undo')?.keys).toBe('⌘ Z');
    expect(shortcutList('Ctrl').find((s) => s.action === 'Undo')?.keys).toBe('Ctrl Z');
  });
});
