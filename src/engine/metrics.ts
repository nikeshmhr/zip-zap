/**
 * Static analysis of a player's design: parts used and worst-case delay (plan §4.7, spec §9).
 * Chips count through to the player's own saved design for them, at any depth.
 */
import type { ChipId, Circuit, ComponentKind } from './model.ts';
import { chipIdOf, isChipKind } from './model.ts';
import type { ComponentResolver } from './primitives.ts';
import { validate } from './validate.ts';

export interface Metrics {
  relays: number;
  nands: number;
  /** Longest input-to-output path in ticks; undefined for circuits with feedback. */
  delay?: number;
}

/** The player's current design for a chip, if they have one. */
export type DesignLookup = (chipId: ChipId) => Circuit | undefined;

/** Memoised chip metrics; `null` means unknown (a design is missing somewhere inside). */
export type MetricsCache = Map<ChipId, Metrics | null>;

/**
 * Returns `null` if any nested chip has no design, or the circuit (or a nested design) is
 * invalid. Pass the same cache across calls, and delete a chip's entry when its design changes
 * (and the entries of chips that use it; clearing the whole cache is simplest).
 */
export function computeMetrics(
  circuit: Circuit,
  resolve: ComponentResolver,
  designs: DesignLookup,
  cache: MetricsCache = new Map(),
): Metrics | null {
  return analyse(circuit, resolve, designs, cache, new Set());
}

function analyse(
  circuit: Circuit,
  resolve: ComponentResolver,
  designs: DesignLookup,
  cache: MetricsCache,
  inProgress: Set<ChipId>,
): Metrics | null {
  const validation = validate(circuit, resolve);
  if (!validation.ok) return null;

  const chipMetrics = (kind: ComponentKind): Metrics | null => {
    if (!isChipKind(kind)) return null;
    const id = chipIdOf(kind);
    if (cache.has(id)) return cache.get(id)!;
    if (inProgress.has(id)) throw new Error(`Chip "${id}" contains itself`);
    const design = designs(id);
    inProgress.add(id);
    const result = design ? analyse(design, resolve, designs, cache, inProgress) : null;
    inProgress.delete(id);
    cache.set(id, result);
    return result;
  };

  // Part counts and per-component delay weights.
  let relays = 0;
  let nands = 0;
  let delayKnown = true;
  const weight = new Map<string, number>();
  for (const c of circuit.components) {
    if (c.kind === 'nand') {
      nands++;
      weight.set(c.id, 1);
    } else if (c.kind === 'relayNO' || c.kind === 'relayNC') {
      relays++;
      weight.set(c.id, 1);
    } else if (isChipKind(c.kind)) {
      const inner = chipMetrics(c.kind);
      if (!inner) return null;
      relays += inner.relays;
      nands += inner.nands;
      if (inner.delay === undefined) delayKnown = false;
      weight.set(c.id, inner.delay ?? 0);
    } else {
      weight.set(c.id, 0); // IO, power, constants
    }
  }

  const metrics: Metrics = { relays, nands };
  if (delayKnown) {
    const delay = longestPath(circuit, validation.nets, weight);
    if (delay !== undefined) metrics.delay = delay;
  }
  return metrics;
}

/** Longest weighted path ending at a level output; undefined if the circuit has a cycle. */
function longestPath(
  circuit: Circuit,
  nets: { drivers: { comp: string }[]; readers: { comp: string }[] }[],
  weight: Map<string, number>,
): number | undefined {
  const succ = new Map<string, Set<string>>(circuit.components.map((c) => [c.id, new Set()]));
  const indegree = new Map<string, number>(circuit.components.map((c) => [c.id, 0]));
  for (const net of nets) {
    for (const d of net.drivers) {
      for (const r of net.readers) {
        const next = succ.get(d.comp)!;
        if (next.has(r.comp)) continue;
        next.add(r.comp);
        indegree.set(r.comp, indegree.get(r.comp)! + 1);
      }
    }
  }

  const dist = new Map<string, number>();
  const queue = circuit.components.filter((c) => indegree.get(c.id) === 0).map((c) => c.id);
  for (const id of queue) dist.set(id, weight.get(id)!);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited++;
    for (const next of succ.get(id)!) {
      dist.set(next, Math.max(dist.get(next) ?? 0, dist.get(id)! + weight.get(next)!));
      const remaining = indegree.get(next)! - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  if (visited < circuit.components.length) return undefined;

  const outs = circuit.components.filter((c) => c.kind === 'out');
  return Math.max(0, ...outs.map((c) => dist.get(c.id) ?? 0));
}
