/**
 * Level statuses for the real catalogue, derived from progress.
 */
import { catalogue } from '../content/index.ts';
import type { LevelStatus } from './unlocks.ts';
import { levelStatuses, nextUnsolved } from './unlocks.ts';
import type { LevelProgress } from './session.ts';
import { useProgress } from './session.ts';

const ORDER = catalogue.levels.map((l) => l.id);

export const statusesFor = (levels: Record<string, LevelProgress>) =>
  levelStatuses(ORDER, (id) => !!levels[id]?.solved);

/** Status of every level; re-renders when progress changes. */
export function useLevelStatuses(): Map<string, LevelStatus> {
  const levels = useProgress((s) => s.levels);
  return statusesFor(levels);
}

export function useNextLevel(): string | undefined {
  const levels = useProgress((s) => s.levels);
  return nextUnsolved(ORDER, (id) => !!levels[id]?.solved);
}
