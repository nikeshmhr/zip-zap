/**
 * Code-first circuit construction for reference solutions and tests (plan §5.2).
 *
 *   buildCircuit({ inputs: ['A', 'B'], outputs: ['OUT'] }, (b) => {
 *     const n = b.add('nand');
 *     b.wire('A', n.in('a'));
 *     b.wire('B', n.in('b'));
 *     b.wire(n.out('out'), 'OUT');
 *   });
 *
 * A string endpoint names a level pin: as a source it is an input switch, as a target an
 * output lamp. Components are laid out automatically in columns by signal depth.
 */
import type { Circuit, ComponentInstance, ComponentKind, PinRef, Wire } from './model.ts';
import { ioId } from './model.ts';
import type { ComponentResolver } from './primitives.ts';

export interface LevelIo {
  inputs: readonly string[];
  outputs: readonly string[];
}

export interface PartHandle {
  id: string;
  kind: ComponentKind;
  in(pin: string): PinRef;
  out(pin: string): PinRef;
}

export interface CircuitBuilder {
  add(kind: ComponentKind): PartHandle;
  wire(from: PinRef | string, to: PinRef | string): void;
}

/** Layout constants, in grid units. */
const COLUMN_WIDTH = 10;
const ROW_GAP = 2;
const PIN_PITCH = 2;

/** The fixed IO components for a level: input switches and output lamps. */
export function ioComponents(io: LevelIo): ComponentInstance[] {
  return [
    ...io.inputs.map((label): ComponentInstance => ({
      id: ioId('in', label),
      kind: 'in',
      label,
      pos: { x: 0, y: 0 },
      rot: 0,
    })),
    ...io.outputs.map((label): ComponentInstance => ({
      id: ioId('out', label),
      kind: 'out',
      label,
      pos: { x: 0, y: 0 },
      rot: 0,
    })),
  ];
}

/** A level's starting circuit: IO only, no parts or wires. */
export function emptyCircuit(io: LevelIo): Circuit {
  return layout({ components: ioComponents(io), wires: [] });
}

export function buildCircuit(
  io: LevelIo,
  recipe: (b: CircuitBuilder) => void,
  resolver?: ComponentResolver,
): Circuit {
  const components = ioComponents(io);
  const wires: Wire[] = [];
  let nextPart = 1;

  const checkPin = (kind: ComponentKind, pin: string, side: 'inputs' | 'outputs') => {
    const def = resolver?.(kind);
    if (resolver && !def) throw new Error(`Unknown component kind "${kind}"`);
    if (def && !def[side].includes(pin)) {
      throw new Error(`"${kind}" has no ${side.slice(0, -1)} pin "${pin}"`);
    }
  };

  const source = (end: PinRef | string): PinRef => {
    if (typeof end !== 'string') return end;
    if (!io.inputs.includes(end)) throw new Error(`"${end}" is not a level input`);
    return { comp: ioId('in', end), pin: 'out' };
  };

  const target = (end: PinRef | string): PinRef => {
    if (typeof end !== 'string') return end;
    if (!io.outputs.includes(end)) throw new Error(`"${end}" is not a level output`);
    return { comp: ioId('out', end), pin: 'in' };
  };

  const builder: CircuitBuilder = {
    add(kind) {
      if (resolver && !resolver(kind)) throw new Error(`Unknown component kind "${kind}"`);
      const id = `c${nextPart++}`;
      components.push({ id, kind, pos: { x: 0, y: 0 }, rot: 0 });
      return {
        id,
        kind,
        in: (pin) => (checkPin(kind, pin, 'inputs'), { comp: id, pin }),
        out: (pin) => (checkPin(kind, pin, 'outputs'), { comp: id, pin }),
      };
    },
    wire(from, to) {
      wires.push({ id: `w${wires.length + 1}`, from: source(from), to: target(to) });
    },
  };

  recipe(builder);
  return layout({ components, wires }, resolver);
}

/**
 * Places components in columns by signal depth (longest path from the inputs, ignoring
 * feedback edges), inputs in the first column and outputs in the last.
 */
export function layout(circuit: Circuit, resolver?: ComponentResolver): Circuit {
  const ids = circuit.components.map((c) => c.id);
  const succ = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const w of circuit.wires) succ.get(w.from.comp)?.push(w.to.comp);

  // Topological order of the graph with feedback (back) edges removed.
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const backEdges = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 'visiting');
    for (const next of succ.get(id) ?? []) {
      const s = state.get(next);
      if (s === 'visiting') backEdges.add(`${id}->${next}`);
      else if (!s) visit(next);
    }
    state.set(id, 'done');
    order.push(id);
  };
  for (const id of ids) if (!state.has(id)) visit(id);
  order.reverse();

  const rank = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const id of order) {
    for (const next of succ.get(id) ?? []) {
      if (backEdges.has(`${id}->${next}`)) continue;
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
    }
  }

  const kindOf = new Map(circuit.components.map((c) => [c.id, c.kind]));
  const parts = circuit.components.filter((c) => c.kind !== 'in' && c.kind !== 'out');
  const lastColumn = Math.max(0, ...parts.map((c) => rank.get(c.id) ?? 0)) + 1;
  const columnOf = (id: string) => {
    const kind = kindOf.get(id);
    if (kind === 'in') return 0;
    if (kind === 'out') return lastColumn;
    return Math.max(1, rank.get(id) ?? 1);
  };

  const height = (kind: ComponentKind) => {
    const def = resolver?.(kind);
    const pins = def ? Math.max(def.inputs.length, def.outputs.length, 1) : 2;
    return pins * PIN_PITCH;
  };

  const nextY = new Map<number, number>();
  const components = circuit.components.map((c) => {
    const column = columnOf(c.id);
    const y = nextY.get(column) ?? 0;
    nextY.set(column, y + height(c.kind) + ROW_GAP);
    return { ...c, pos: { x: column * COLUMN_WIDTH, y } };
  });

  return { components, wires: circuit.wires };
}
