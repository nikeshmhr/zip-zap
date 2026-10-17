/**
 * Which family a chip belongs to, by the chapter that unlocks it, so chips can be told apart
 * at a glance (gates, routing, arithmetic, memory).
 */
import { catalogue } from '../content/index.ts';
import type { ComponentKind } from '../engine/model.ts';

const FAMILIES = ['', 'gates', 'routing', 'arithmetic', 'memory'] as const;

const familyOf = new Map<ComponentKind, string>(
  catalogue.levels.flatMap((l) =>
    l.unlocks && FAMILIES[l.chapter] ? [[l.unlocks.kind, FAMILIES[l.chapter]!] as const] : [],
  ),
);

export const chipFamily = (kind: ComponentKind): string | undefined => familyOf.get(kind);
