/**
 * Metrics for a solved level, counted through chips using the player's own designs.
 */
import { catalogue } from '../../content/index.ts';
import type { LevelDef } from '../../content/types.ts';
import type { Metrics } from '../../engine/metrics.ts';
import { computeMetrics } from '../../engine/metrics.ts';
import { validate } from '../../engine/validate.ts';
import type { ChipId, Circuit } from '../../engine/model.ts';
import { chipIdOf, isChipKind } from '../../engine/model.ts';
import { useProgress } from '../../state/session.ts';

/** Which level builds each chip. */
const chipLevel = new Map<ChipId, string>(
  catalogue.levels.flatMap((l) =>
    l.unlocks && isChipKind(l.unlocks.kind) ? [[chipIdOf(l.unlocks.kind), l.id] as const] : [],
  ),
);

/**
 * The player's design for a chip, or the reference design if they haven't solved it or their
 * design no longer validates (e.g. after a content update).
 */
export function chipDesign(id: ChipId): Circuit | undefined {
  const levelId = chipLevel.get(id);
  if (!levelId) return undefined;
  const design = useProgress.getState().get(levelId).design;
  if (design && validate(design, catalogue.resolve).ok) return design;
  return catalogue.referenceCircuit(levelId);
}

export interface SolveMetrics {
  /** Relays in Chapter 0, NAND gates after (spec §9). */
  count: number;
  unit: 'relay' | 'NAND';
  /** Combinational levels only (spec §15.5). */
  delay?: number;
}

export function solveMetrics(level: LevelDef, circuit: Circuit): SolveMetrics | null {
  const metrics: Metrics | null = computeMetrics(circuit, catalogue.resolve, chipDesign);
  if (!metrics) return null;
  return {
    count: level.chapter === 0 ? metrics.relays : metrics.nands,
    unit: level.chapter === 0 ? 'relay' : 'NAND',
    delay: level.goal.kind === 'combinational' ? metrics.delay : undefined,
  };
}

export const formatCount = (count: number, unit: SolveMetrics['unit']) =>
  `${count} ${unit === 'relay' ? (count === 1 ? 'relay' : 'relays') : count === 1 ? 'NAND gate' : 'NAND gates'}`;
