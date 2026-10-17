/**
 * Pure editing operations on circuits. The editor store wraps these with history.
 * Level IO components are fixed: they can't be moved, rotated, duplicated or deleted.
 */
import { produce } from 'immer';
import type {
  Circuit,
  ComponentInstance,
  ComponentKind,
  LevelIo,
  Point,
  Rotation,
} from '../engine/model.ts';
import { ioId, isIoKind } from '../engine/model.ts';

/** Grid distance between the input and output columns of a fresh level. */
export const STAGE_WIDTH = 40;
/** Vertical grid distance between neighbouring level pins. */
export const IO_PITCH = 4;

/** A level's starting circuit: input switches on the left, output lamps on the right. */
export function startCircuit(io: LevelIo): Circuit {
  const rows = Math.max(io.inputs.length, io.outputs.length);
  const column = (labels: readonly string[], kind: 'in' | 'out', x: number) => {
    const top = ((rows - labels.length) * IO_PITCH) / 2;
    return labels.map((label, i): ComponentInstance => ({
      id: ioId(kind, label),
      kind,
      label,
      pos: { x, y: top + i * IO_PITCH },
      rot: 0,
    }));
  };
  return {
    components: [...column(io.inputs, 'in', 0), ...column(io.outputs, 'out', STAGE_WIDTH)],
    wires: [],
  };
}

/** The next free id with this prefix, e.g. `p7` after `p1…p6`. */
export function nextId(ids: Iterable<string>, prefix: string): string {
  let max = 0;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of ids) {
    const match = pattern.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${max + 1}`;
}

export interface EditOptions {
  /** Level IO can't be moved, rotated or deleted (true for levels, false for the sandbox). */
  fixedIo: boolean;
}

const LEVEL: EditOptions = { fixedIo: true };

const isFixed = (c: ComponentInstance, opts: EditOptions) => opts.fixedIo && isIoKind(c.kind);

export function addComponent(
  circuit: Circuit,
  kind: ComponentKind,
  pos: Point,
  label?: string,
): { circuit: Circuit; id: string } {
  const id = nextId(
    circuit.components.map((c) => c.id),
    'p',
  );
  const next = produce(circuit, (draft) => {
    draft.components.push({
      id,
      kind,
      pos: { x: Math.round(pos.x), y: Math.round(pos.y) },
      rot: 0,
      ...(label === undefined ? {} : { label }),
    });
  });
  return { circuit: next, id };
}

/** Moves the given parts by a whole number of grid units. Fixed IO stays put. */
export function moveComponents(
  circuit: Circuit,
  ids: readonly string[],
  delta: Point,
  opts: EditOptions = LEVEL,
): Circuit {
  const dx = Math.round(delta.x);
  const dy = Math.round(delta.y);
  if (dx === 0 && dy === 0) return circuit;
  const move = new Set(ids);
  return produce(circuit, (draft) => {
    for (const c of draft.components) {
      if (move.has(c.id) && !isFixed(c, opts)) {
        c.pos.x += dx;
        c.pos.y += dy;
      }
    }
  });
}

/** Rotates parts a quarter turn clockwise. IO switches and lamps never rotate. */
export function rotateComponents(circuit: Circuit, ids: readonly string[]): Circuit {
  const turn = new Set(ids);
  // IO switches and lamps are never rotated, so their labels stay readable.
  const rotatable = (c: ComponentInstance) => turn.has(c.id) && !isIoKind(c.kind);
  if (!circuit.components.some(rotatable)) return circuit;
  return produce(circuit, (draft) => {
    for (const c of draft.components) {
      if (rotatable(c)) c.rot = ((c.rot + 90) % 360) as Rotation;
    }
  });
}

/** Deletes parts (with their wires) and wires. Fixed IO is never deleted. */
export function deleteItems(
  circuit: Circuit,
  componentIds: readonly string[],
  wireIds: readonly string[],
  opts: EditOptions = LEVEL,
): Circuit {
  const doomed = new Set(
    circuit.components
      .filter((c) => componentIds.includes(c.id) && !isFixed(c, opts))
      .map((c) => c.id),
  );
  const doomedWires = new Set(wireIds);
  const wires = circuit.wires.filter(
    (w) => !doomedWires.has(w.id) && !doomed.has(w.from.comp) && !doomed.has(w.to.comp),
  );
  if (doomed.size === 0 && wires.length === circuit.wires.length) return circuit;
  return {
    components: circuit.components.filter((c) => !doomed.has(c.id)),
    wires,
  };
}

/**
 * Copies parts, plus the wires running between copied parts, offset by `offset`.
 * Returns the ids of the copies.
 */
export function duplicateComponents(
  circuit: Circuit,
  ids: readonly string[],
  offset: Point = { x: 2, y: 2 },
): { circuit: Circuit; ids: string[] } {
  // IO is never duplicated: pin names must stay unique.
  const sources = circuit.components.filter((c) => ids.includes(c.id) && !isIoKind(c.kind));
  if (sources.length === 0) return { circuit, ids: [] };

  const idMap = new Map<string, string>();
  const allIds = circuit.components.map((c) => c.id);
  for (const c of sources) {
    const id = nextId(allIds, 'p');
    allIds.push(id);
    idMap.set(c.id, id);
  }
  const wireIds = circuit.wires.map((w) => w.id);

  const next = produce(circuit, (draft) => {
    for (const c of sources) {
      draft.components.push({
        ...c,
        id: idMap.get(c.id)!,
        pos: { x: c.pos.x + offset.x, y: c.pos.y + offset.y },
      });
    }
    for (const w of circuit.wires) {
      const from = idMap.get(w.from.comp);
      const to = idMap.get(w.to.comp);
      if (!from || !to) continue;
      const id = nextId(wireIds, 'w');
      wireIds.push(id);
      draft.wires.push({ id, from: { ...w.from, comp: from }, to: { ...w.to, comp: to } });
    }
  });
  return { circuit: next, ids: [...idMap.values()] };
}

/** Whether a component may be moved, rotated, duplicated or deleted. */
export const isEditable = (circuit: Circuit, id: string, opts: EditOptions = LEVEL) => {
  const c = circuit.components.find((x) => x.id === id);
  return !!c && !isFixed(c, opts);
};

/**
 * The next free name for a free-standing switch or lamp (sandbox): inputs are A, B, C…;
 * outputs are OUT, OUT2, OUT3…
 */
export function nextIoLabel(circuit: Circuit, kind: 'in' | 'out'): string {
  const taken = new Set(circuit.components.filter((c) => c.kind === kind).map((c) => c.label));
  if (kind === 'in') {
    for (let i = 0; i < 26; i++) {
      const label = String.fromCharCode(65 + i);
      if (!taken.has(label)) return label;
    }
    for (let i = 2; ; i++) if (!taken.has(`IN${i}`)) return `IN${i}`;
  }
  if (!taken.has('OUT')) return 'OUT';
  for (let i = 2; ; i++) if (!taken.has(`OUT${i}`)) return `OUT${i}`;
}

/**
 * Drops parts whose kind no longer exists and wires to missing parts or pins (e.g. a save from
 * before a content change). Returns the circuit unchanged if nothing was dropped.
 */
export function sanitizeCircuit(
  circuit: Circuit,
  resolve: (
    kind: ComponentKind,
  ) => { inputs: readonly string[]; outputs: readonly string[] } | undefined,
): { circuit: Circuit; removed: number } {
  const defs = new Map(circuit.components.map((c) => [c.id, resolve(c.kind)]));
  const components = circuit.components.filter((c) => defs.get(c.id));
  const wires = circuit.wires.filter((w) => {
    const from = defs.get(w.from.comp);
    const to = defs.get(w.to.comp);
    return !!from?.outputs.includes(w.from.pin) && !!to?.inputs.includes(w.to.pin);
  });
  const removed =
    circuit.components.length - components.length + (circuit.wires.length - wires.length);
  return removed === 0 ? { circuit, removed } : { circuit: { components, wires }, removed };
}
