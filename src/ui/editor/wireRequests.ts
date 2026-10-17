/**
 * Turns a circuit's wires into routing requests: where each wire starts and ends and which way
 * it leaves each pin. Shared by the editor and the router benchmarks.
 */
import type { Circuit, ComponentKind } from '../../engine/model.ts';
import type { PartGeom, Rect, WireRequest } from './geometry.ts';
import { findPin, partRect, pinFacing, pinWorld } from './geometry.ts';

export function wireRequests(
  circuit: Circuit,
  geomOf: (kind: ComponentKind) => PartGeom | undefined,
): { requests: WireRequest[]; obstacles: Rect[] } {
  const parts = new Map(circuit.components.map((c) => [c.id, c]));
  const anchor = (comp: string, pin: string, dir: 'in' | 'out') => {
    const part = parts.get(comp);
    const geom = part && geomOf(part.kind);
    const pinGeom = geom && findPin(geom, pin, dir);
    if (!part || !geom || !pinGeom) return undefined;
    return { at: pinWorld(part, geom, pinGeom), facing: pinFacing(part, pinGeom) };
  };
  const requests = circuit.wires.flatMap((w): WireRequest[] => {
    const from = anchor(w.from.comp, w.from.pin, 'out');
    const to = anchor(w.to.comp, w.to.pin, 'in');
    if (!from || !to) return [];
    return [
      {
        id: w.id,
        source: `${w.from.comp}|${w.from.pin}`,
        target: `${w.to.comp}|${w.to.pin}`,
        start: from.at,
        startDir: from.facing,
        end: to.at,
        endDir: to.facing,
      },
    ];
  });
  const obstacles = circuit.components.flatMap((c) => {
    const g = geomOf(c.kind);
    return g ? [partRect(c, g)] : [];
  });
  return { requests, obstacles };
}
