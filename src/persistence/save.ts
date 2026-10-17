/**
 * The save file (plan §7): a versioned JSON document in localStorage, validated on load,
 * upgraded through a chain of migrations, and quarantined rather than lost if unreadable.
 */
import { z } from 'zod';
import type { ComponentKind } from '../engine/model.ts';

export const SAVE_KEY = 'zipzap.save';
export const CURRENT_VERSION = 1;

const point = z.object({ x: z.number(), y: z.number() });
const pinRef = z.object({ comp: z.string(), pin: z.string() });
const kind = z.custom<ComponentKind>((v) => typeof v === 'string' && v.length > 0, {
  message: 'Expected a component kind',
});

const circuit = z.object({
  components: z.array(
    z.object({
      id: z.string(),
      kind,
      pos: point,
      rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
      label: z.string().optional(),
    }),
  ),
  wires: z.array(
    z.object({ id: z.string(), from: pinRef, to: pinRef, bends: z.array(point).optional() }),
  ),
});

const levelProgress = z.object({
  solved: z.boolean(),
  best: z.object({ count: z.number(), delay: z.number().optional() }).optional(),
  design: circuit.optional(),
  hints: z.number().int().min(0).max(2),
  conceptSeen: z.boolean(),
});

const settings = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  sound: z.boolean(),
  motion: z.enum(['system', 'reduce']),
});

const saveV1 = z.object({
  version: z.literal(1),
  progress: z.record(z.string(), levelProgress),
  /** Circuits by level id, plus "sandbox". */
  circuits: z.record(z.string(), circuit),
  settings,
});

export type Save = z.infer<typeof saveV1>;
export type Settings = Save['settings'];

export const DEFAULT_SETTINGS: Settings = { theme: 'system', sound: true, motion: 'system' };

export const emptySave = (): Save => ({
  version: 1,
  progress: {},
  circuits: {},
  settings: { ...DEFAULT_SETTINGS },
});

/** Upgrades a save from version n to n + 1. */
export type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/** One entry per past version. Version 1 is the first, so there are none yet. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export type ParseResult =
  { ok: true; save: Save } | { ok: false; reason: 'invalid' | 'newer'; message: string };

/** Brings any readable save up to the current version and validates it. */
export function parseSave(
  data: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): ParseResult {
  if (typeof data !== 'object' || data === null || !('version' in data)) {
    return { ok: false, reason: 'invalid', message: 'This is not a Zip Zap save.' };
  }
  let save = data as Record<string, unknown>;
  const initial = save.version;
  if (typeof initial !== 'number' || !Number.isInteger(initial) || initial < 0) {
    return { ok: false, reason: 'invalid', message: 'The save has no valid version.' };
  }
  let version: number = initial;
  if (version > CURRENT_VERSION) {
    return {
      ok: false,
      reason: 'newer',
      message: 'This save is from a newer version of Zip Zap.',
    };
  }
  while (version < CURRENT_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      return { ok: false, reason: 'invalid', message: `No upgrade from save version ${version}.` };
    }
    save = migrate(save);
    version = save.version as number;
  }
  const result = saveV1.safeParse(save);
  if (!result.success) {
    return { ok: false, reason: 'invalid', message: 'The save is damaged and can’t be read.' };
  }
  return { ok: true, save: result.data };
}

export interface Loaded {
  save: Save;
  /** Set when an existing save couldn't be read and was set aside. */
  notice?: { message: string; backupKey: string };
}

/**
 * Loads the save. An unreadable one is copied to `zipzap.save.corrupt.<time>` (never
 * deleted), replaced by a fresh save so it's only set aside once, and the game starts fresh.
 * Never throws, even if storage is full.
 */
export function loadSave(storage: Storage, now = Date.now()): Loaded {
  const raw = storage.getItem(SAVE_KEY);
  if (raw === null) return { save: emptySave() };
  let result: ParseResult;
  try {
    result = parseSave(JSON.parse(raw));
  } catch {
    result = { ok: false, reason: 'invalid', message: 'The save is damaged and can’t be read.' };
  }
  if (result.ok) return { save: result.save };
  const backupKey = `${SAVE_KEY}.corrupt.${now}`;
  const fresh = emptySave();
  try {
    storage.setItem(backupKey, raw);
    storage.setItem(SAVE_KEY, JSON.stringify(fresh));
  } catch {
    // Storage is full or blocked: leave the damaged save where it is and carry on.
    return {
      save: fresh,
      notice: { message: `${result.message} It couldn't be backed up.`, backupKey: SAVE_KEY },
    };
  }
  return { save: fresh, notice: { message: result.message, backupKey } };
}

/** Writes the save. Returns false if the browser refused (e.g. storage full or disabled). */
export function writeSave(storage: Storage, save: Save): boolean {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export const exportSave = (save: Save): string => JSON.stringify(save, null, 2);

/** Reads an exported save file's text. */
export function importSave(text: string): ParseResult {
  try {
    return parseSave(JSON.parse(text));
  } catch {
    return { ok: false, reason: 'invalid', message: 'That file isn’t a Zip Zap save.' };
  }
}

export const exportFileName = (date = new Date()) =>
  `zipzap-save-${date.toISOString().slice(0, 10).replaceAll('-', '')}.json`;
