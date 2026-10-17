/**
 * Circuit data model: what the editor manipulates and what saves contain (plan §4.1).
 * Layout fields (pos, rot, bends) are ignored by the simulator.
 */

export type Bit = 0 | 1;

/** Pin values keyed by pin name, e.g. `{ A: 1, B: 0 }`. */
export type Bits = Record<string, Bit>;

export type ChipId = string;

export type PrimitiveKind =
  | 'power'
  | 'const0'
  | 'const1'
  | 'relayNO'
  | 'relayNC'
  | 'nand'
  /** Level input: a switch the player or test runner toggles. Its `label` is the pin name. */
  | 'in'
  /** Level output: a lamp read by the test runner. Its `label` is the pin name. */
  | 'out';

export type ChipKind = `chip:${ChipId}`;

export type ComponentKind = PrimitiveKind | ChipKind;

export type Rotation = 0 | 90 | 180 | 270;

export interface Point {
  x: number;
  y: number;
}

export interface ComponentInstance {
  id: string;
  kind: ComponentKind;
  /** Grid units. */
  pos: Point;
  rot: Rotation;
  /** Pin name for `in`/`out` components. */
  label?: string;
}

export interface PinRef {
  comp: string;
  pin: string;
}

export interface Wire {
  id: string;
  /** An output pin. */
  from: PinRef;
  /** An input pin. */
  to: PinRef;
  bends?: Point[];
}

export interface Circuit {
  components: ComponentInstance[];
  wires: Wire[];
}

// ---------------------------------------------------------------------------
// Kind helpers

export const chipKind = (id: ChipId): ChipKind => `chip:${id}`;

export const isChipKind = (kind: ComponentKind): kind is ChipKind => kind.startsWith('chip:');

export const chipIdOf = (kind: ChipKind): ChipId => kind.slice('chip:'.length);

export const isIoKind = (kind: ComponentKind): kind is 'in' | 'out' =>
  kind === 'in' || kind === 'out';

/** Component ids used for level IO, so a pin name maps to a stable id. */
export const ioId = (kind: 'in' | 'out', label: string): string => `${kind}:${label}`;

// ---------------------------------------------------------------------------
// Bit helpers

/** Truthy → 1; falsy or missing (e.g. an unconnected pin) → 0. */
export const toBit = (value: boolean | number | undefined): Bit => (value ? 1 : 0);

/**
 * Every combination of values for `names`, in truth-table order:
 * the first name is the most significant bit, so it changes slowest.
 */
export function enumerateRows(names: readonly string[]): Bits[] {
  const rows: Bits[] = [];
  const count = 2 ** names.length;
  for (let row = 0; row < count; row++) {
    const bits: Bits = {};
    names.forEach((name, i) => {
      bits[name] = toBit((row >> (names.length - 1 - i)) & 1);
    });
    rows.push(bits);
  }
  return rows;
}

/** Pin names of a multi-bit value, least significant first: `bus('A', 3)` → `['A0', 'A1', 'A2']`. */
export const bus = (prefix: string, width: number): string[] =>
  Array.from({ length: width }, (_, i) => `${prefix}${i}`);

/** Reads `prefix0..prefix{width-1}` as an unsigned number (bit 0 is least significant). */
export function readBus(bits: Bits, prefix: string, width: number): number {
  let value = 0;
  for (let i = width - 1; i >= 0; i--) value = value * 2 + (bits[`${prefix}${i}`] ?? 0);
  return value;
}

/** Writes the low `width` bits of `value` as `prefix0..prefix{width-1}`. */
export function writeBus(prefix: string, width: number, value: number): Bits {
  const bits: Bits = {};
  for (let i = 0; i < width; i++) bits[`${prefix}${i}`] = toBit((value >> i) & 1);
  return bits;
}

/** Formats bits in the given order as a compact string, e.g. `"101"`. */
export const formatBits = (bits: Bits, names: readonly string[]): string =>
  names.map((n) => bits[n] ?? 0).join('');
