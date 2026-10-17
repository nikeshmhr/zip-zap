import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Migration } from '../../src/persistence/save.ts';
import {
  SAVE_KEY,
  emptySave,
  exportFileName,
  exportSave,
  importSave,
  loadSave,
  parseSave,
  writeSave,
} from '../../src/persistence/save.ts';

/** A minimal in-memory Storage. */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  keys() {
    return [...this.data.keys()];
  }
}

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8'),
) as unknown;

describe('save round trip', () => {
  it('writes and loads the same save', () => {
    const storage = new MemoryStorage();
    const result = parseSave(fixture);
    if (!result.ok) throw new Error(result.message);
    expect(writeSave(storage, result.save)).toBe(true);
    expect(loadSave(storage)).toEqual({ save: result.save });
  });

  it('starts fresh when there is no save', () => {
    expect(loadSave(new MemoryStorage())).toEqual({ save: emptySave() });
  });

  it('exports and imports through text', () => {
    const result = parseSave(fixture);
    if (!result.ok) throw new Error(result.message);
    expect(importSave(exportSave(result.save))).toEqual({ ok: true, save: result.save });
  });

  it('names export files by date', () => {
    expect(exportFileName(new Date('2026-10-17T12:00:00Z'))).toBe('zipzap-save-20261017.json');
  });
});

describe('the version 1 fixture', () => {
  it('still loads, field for field', () => {
    const result = parseSave(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.progress['0.1']?.best).toEqual({ count: 1, delay: 1 });
    expect(result.save.progress['0.1']?.design?.wires).toHaveLength(3);
    expect(result.save.settings.theme).toBe('dark');
  });
});

describe('migrations', () => {
  it('upgrades older saves step by step before validating', () => {
    const fromV0: Migration = (old) => ({
      version: 1,
      progress: {},
      circuits: old.circuits as unknown,
      settings: { theme: 'system', sound: true, motion: 'system' },
    });
    const result = parseSave({ version: 0, circuits: {} }, { 0: fromV0 });
    expect(result).toEqual({ ok: true, save: emptySave() });
  });

  it('refuses versions it cannot upgrade, or newer than it knows', () => {
    expect(parseSave({ version: 0 })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(parseSave({ version: 99 })).toMatchObject({ ok: false, reason: 'newer' });
  });
});

describe('damaged saves', () => {
  it('quarantines unreadable JSON and starts fresh with a notice', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{ not json');
    const loaded = loadSave(storage, 1234);
    expect(loaded.save).toEqual(emptySave());
    expect(loaded.notice).toEqual({
      message: expect.stringContaining('damaged'),
      backupKey: `${SAVE_KEY}.corrupt.1234`,
    });
    expect(storage.getItem(`${SAVE_KEY}.corrupt.1234`)).toBe('{ not json');
  });

  it('quarantines saves that fail validation', () => {
    const storage = new MemoryStorage();
    const broken = { ...emptySave(), progress: { '0.1': { solved: 'yes' } } };
    storage.setItem(SAVE_KEY, JSON.stringify(broken));
    const loaded = loadSave(storage, 5);
    expect(loaded.notice?.backupKey).toBe(`${SAVE_KEY}.corrupt.5`);
    expect(storage.keys()).toContain(`${SAVE_KEY}.corrupt.5`);
  });

  it('rejects import files that are not saves', () => {
    expect(importSave('hello')).toMatchObject({ ok: false });
    expect(importSave('{"foo": 1}')).toMatchObject({ ok: false });
  });

  it('reports when the browser refuses to store the save', () => {
    const full = new MemoryStorage();
    full.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(writeSave(full, emptySave())).toBe(false);
  });
});
