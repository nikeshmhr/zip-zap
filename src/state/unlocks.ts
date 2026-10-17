/**
 * Unlock rules (spec §7.3): levels unlock in order within a chapter, and a chapter unlocks when
 * the previous one is complete. With chapters in order, that means: a level is available once
 * every earlier level is solved.
 */
import type { ComponentKind } from '../engine/model.ts';

export type LevelStatus = 'locked' | 'available' | 'solved';

export function levelStatuses(
  order: readonly string[],
  isSolved: (id: string) => boolean,
): Map<string, LevelStatus> {
  const statuses = new Map<string, LevelStatus>();
  let earlierAllSolved = true;
  for (const id of order) {
    const solved = isSolved(id);
    statuses.set(id, solved ? 'solved' : earlierAllSolved ? 'available' : 'locked');
    earlierAllSolved &&= solved;
  }
  return statuses;
}

/** The first level the player hasn't solved yet, if any. */
export const nextUnsolved = (order: readonly string[], isSolved: (id: string) => boolean) =>
  order.find((id) => !isSolved(id));

/** Kinds unlocked by the solved levels, in play order (for the sandbox). */
export function unlockedKinds(
  levels: readonly { id: string; unlocks?: { kind: ComponentKind } }[],
  isSolved: (id: string) => boolean,
): ComponentKind[] {
  return levels.flatMap((l) => (l.unlocks && isSolved(l.id) ? [l.unlocks.kind] : []));
}
