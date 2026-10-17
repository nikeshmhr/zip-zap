/**
 * The catalogue: ordered levels, the chip catalogue derived from them, toolboxes and
 * everything else needed to play or test a level.
 */
import { buildCircuit } from '../engine/builder.ts';
import type { ChipDef } from '../engine/chips.ts';
import { createResolver } from '../engine/chips.ts';
import type { Circuit, ComponentKind, LevelIo } from '../engine/model.ts';
import { chipIdOf, isChipKind } from '../engine/model.ts';
import type { ComponentResolver } from '../engine/primitives.ts';
import { isPrimitiveKind } from '../engine/primitives.ts';
import type { TestSpec } from '../engine/testRunner.ts';
import type { ValidateOptions } from '../engine/validate.ts';
import type { ChapterDef, LevelDef, LevelId } from './types.ts';

/** Always in an `'unlocked'` toolbox (spec §6: constants from Chapter 1 on). */
export const BASE_TOOLBOX: readonly ComponentKind[] = ['const0', 'const1'];

export interface Catalogue {
  chapters: readonly ChapterDef[];
  levels: readonly LevelDef[];
  chips: readonly ChipDef[];
  resolve: ComponentResolver;
  level(id: LevelId): LevelDef;
  /** The level after this one, in play order. */
  next(id: LevelId): LevelDef | undefined;
  /** Kinds the player may place in this level, in toolbox display order. */
  toolbox(id: LevelId): readonly ComponentKind[];
  validateOptions(id: LevelId): ValidateOptions;
  testSpec(id: LevelId): TestSpec;
  referenceCircuit(id: LevelId): Circuit;
  /** Display name for a component kind (unlock name for chips and NAND). */
  displayName(kind: ComponentKind): string;
  /** The level's pins in canvas order (its layout, or else truth-table order). */
  canvasIo(id: LevelId): LevelIo;
}

const PRIMITIVE_NAMES: Partial<Record<ComponentKind, string>> = {
  power: 'Power',
  const0: 'Constant 0',
  const1: 'Constant 1',
  relayNO: 'Relay (normally open)',
  relayNC: 'Relay (normally closed)',
  nand: 'NAND',
  in: 'Input',
  out: 'Output',
};

/** Builds a catalogue, checking the level list is consistent. Throws on authoring mistakes. */
export function createCatalogue(
  chapters: readonly ChapterDef[],
  levels: readonly LevelDef[],
): Catalogue {
  const byId = new Map<LevelId, LevelDef>();
  const unlockNames = new Map<ComponentKind, string>();
  const chips: ChipDef[] = [];
  const chapterIds = new Set(chapters.map((c) => c.id));

  let lastChapter = -Infinity;
  for (const level of levels) {
    if (byId.has(level.id)) throw new Error(`Duplicate level id "${level.id}"`);
    if (!chapterIds.has(level.chapter)) {
      throw new Error(`Level ${level.id} is in unknown chapter ${level.chapter}`);
    }
    if (level.chapter < lastChapter) throw new Error(`Level ${level.id} is out of chapter order`);
    lastChapter = level.chapter;
    byId.set(level.id, level);

    const unlock = level.unlocks;
    if (!unlock) continue;
    if (unlockNames.has(unlock.kind)) throw new Error(`"${unlock.kind}" is unlocked twice`);
    unlockNames.set(unlock.kind, unlock.name);
    if (isChipKind(unlock.kind)) {
      const { goal } = level;
      chips.push({
        id: chipIdOf(unlock.kind),
        name: unlock.name,
        inputs: level.inputs,
        outputs: level.outputs,
        behavior:
          goal.kind === 'combinational'
            ? { kind: 'combinational', fn: goal.fn }
            : { kind: 'sequential', model: goal.model },
      });
    } else if (!isPrimitiveKind(unlock.kind)) {
      throw new Error(`Level ${level.id} unlocks unknown kind "${unlock.kind}"`);
    }
  }

  const resolve = createResolver(chips);
  const level = (id: LevelId) => {
    const found = byId.get(id);
    if (!found) throw new Error(`Unknown level "${id}"`);
    return found;
  };

  const toolboxCache = new Map<LevelId, readonly ComponentKind[]>();
  const toolbox = (id: LevelId) => {
    const cached = toolboxCache.get(id);
    if (cached) return cached;
    const def = level(id);
    let kinds: ComponentKind[];
    if (def.toolbox.include === 'unlocked') {
      const index = levels.indexOf(def);
      const unlocked = levels.slice(0, index).flatMap((l) => (l.unlocks ? [l.unlocks.kind] : []));
      kinds = [...BASE_TOOLBOX, ...unlocked];
    } else {
      kinds = [...def.toolbox.include];
    }
    const exclude = new Set(def.toolbox.exclude ?? []);
    const result = kinds.filter((k) => !exclude.has(k));
    toolboxCache.set(id, result);
    return result;
  };

  return {
    chapters,
    levels,
    chips,
    resolve,
    level,
    next: (id) => levels[levels.indexOf(level(id)) + 1],
    toolbox,
    validateOptions: (id) => ({
      allowedKinds: new Set(toolbox(id)),
      inputsOnlyDrive: level(id).constraints?.inputsOnlyDrive,
    }),
    testSpec: (id) => {
      const { inputs, outputs, goal } = level(id);
      return { inputs, outputs, goal };
    },
    referenceCircuit: (id) => {
      const def = level(id);
      return buildCircuit(def, def.reference, resolve);
    },
    displayName: (kind) => unlockNames.get(kind) ?? PRIMITIVE_NAMES[kind] ?? kind,
    canvasIo: (id) => {
      const def = level(id);
      return {
        inputs: def.layout?.inputs ?? def.inputs,
        outputs: def.layout?.outputs ?? def.outputs,
      };
    },
  };
}
