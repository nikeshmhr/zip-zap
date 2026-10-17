import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY, emptySave } from '../../src/persistence/save.ts';
import { startCircuit } from '../../src/state/editing.ts';
import type { Autosave } from '../../src/state/persist.ts';
import {
  collectSave,
  hydrate,
  initPersistence,
  useSaveNotice,
  watchOtherTabs,
} from '../../src/state/persist.ts';
import { levelEditor, resetEditors, useProgress } from '../../src/state/session.ts';
import { useSettings } from '../../src/state/settings.ts';
import { MemoryStorage } from '../support/memoryStorage.ts';

const io = { inputs: ['A', 'B'], outputs: ['OUT'] };

let autosave: Autosave | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  resetEditors();
  hydrate(emptySave());
  useSaveNotice.getState().dismiss();
});

afterEach(() => {
  autosave?.stop();
  vi.useRealTimers();
});

describe('loading', () => {
  it('restores progress, settings and saved circuits into new editors', () => {
    const storage = new MemoryStorage();
    const circuit = startCircuit(io);
    circuit.components.push({ id: 'p1', kind: 'nand', pos: { x: 10, y: 0 }, rot: 0 });
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        ...emptySave(),
        progress: { '1.2': { solved: true, hints: 1, conceptSeen: true } },
        circuits: { '1.2': circuit },
        settings: { theme: 'dark', sound: false, motion: 'reduce' },
      }),
    );
    autosave = initPersistence(storage);
    expect(useProgress.getState().get('1.2').solved).toBe(true);
    expect(useSettings.getState().settings.theme).toBe('dark');
    expect(levelEditor('1.2', io).getState().circuit.components).toHaveLength(4);
  });

  it('ignores a saved circuit whose pins no longer match the level', () => {
    hydrate({ ...emptySave(), circuits: { '1.2': startCircuit({ inputs: ['X'], outputs: [] }) } });
    expect(levelEditor('1.2', io).getState().circuit).toEqual(startCircuit(io));
  });

  it('shows a notice when the save was damaged', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, 'garbage');
    autosave = initPersistence(storage);
    expect(useSaveNotice.getState().message).toMatch(/copy was kept/);
  });
});

describe('autosave', () => {
  it('writes 500 ms after the last change, batching changes', () => {
    const storage = new MemoryStorage();
    autosave = initPersistence(storage);
    const editor = levelEditor('1.1', { inputs: ['A'], outputs: ['OUT'] });
    editor.getState().addPart('nand', { x: 10, y: 0 });
    vi.advanceTimersByTime(300);
    editor.getState().addPart('nand', { x: 20, y: 0 });
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    vi.advanceTimersByTime(500);
    const saved = JSON.parse(storage.getItem(SAVE_KEY)!);
    expect(saved.circuits['1.1'].components).toHaveLength(4);
  });

  it('saves progress and settings changes, and flushes on demand', () => {
    const storage = new MemoryStorage();
    autosave = initPersistence(storage);
    useProgress.getState().revealHint('2.1');
    useSettings.getState().update({ sound: false });
    autosave.flush();
    const saved = JSON.parse(storage.getItem(SAVE_KEY)!);
    expect(saved.progress['2.1'].hints).toBe(1);
    expect(saved.settings.sound).toBe(false);
  });

  it('keeps saved circuits for levels not opened this session', () => {
    hydrate({ ...emptySave(), circuits: { '3.3': startCircuit(io) } });
    levelEditor('1.1', { inputs: ['A'], outputs: ['OUT'] });
    expect(Object.keys(collectSave().circuits).sort()).toEqual(['1.1', '3.3']);
  });

  it('writes nothing after being stopped, even when flushed with a change pending', () => {
    const storage = new MemoryStorage();
    autosave = initPersistence(storage);
    useProgress.getState().revealHint('2.1');
    autosave.stop();
    autosave.flush();
    vi.advanceTimersByTime(1000);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });

  it('warns once if the browser refuses to save', () => {
    const storage = new MemoryStorage();
    autosave = initPersistence(storage);
    storage.setItem = () => {
      throw new Error('quota');
    };
    useProgress.getState().revealHint('2.1');
    autosave.flush();
    expect(useSaveNotice.getState().message).toMatch(/isn't letting Zip Zap save/);
  });
});

describe('other tabs', () => {
  it('stops saving and offers a reload when another tab writes the save', () => {
    const storage = new MemoryStorage();
    autosave = initPersistence(storage);
    const target = new EventTarget();
    const reload = vi.fn();
    watchOtherTabs(target as unknown as Window, autosave, reload);

    // Another tab saved (e.g. imported or reset).
    target.dispatchEvent(Object.assign(new Event('storage'), { key: SAVE_KEY }));
    expect(useSaveNotice.getState().message).toMatch(/another tab/);

    // This tab's later changes must not overwrite it.
    useProgress.getState().revealHint('2.1');
    autosave.flush();
    vi.advanceTimersByTime(1000);
    expect(storage.getItem(SAVE_KEY)).toBeNull();

    useSaveNotice.getState().action?.run();
    expect(reload).toHaveBeenCalled();
  });

  it('ignores storage events for other keys', () => {
    const storage = new MemoryStorage();
    autosave = initPersistence(storage);
    const target = new EventTarget();
    watchOtherTabs(target as unknown as Window, autosave, () => {});
    target.dispatchEvent(Object.assign(new Event('storage'), { key: 'something-else' }));
    useProgress.getState().revealHint('2.1');
    autosave.flush();
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
  });
});
