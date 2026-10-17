/**
 * Shorthand for writing reference solutions with chips the player has unlocked.
 * Each gate helper adds one chip and returns its output pin.
 */
import type { CircuitBuilder, PartHandle } from '../engine/builder.ts';
import type { ChipKind, ComponentKind, PinRef } from '../engine/model.ts';
import { chipKind } from '../engine/model.ts';

/** A pin, or a level pin name. */
export type Pin = PinRef | string;

/** Chip kinds, by the id their level unlocks them under. */
export const CHIP = {
  not: chipKind('not'),
  and: chipKind('and'),
  or: chipKind('or'),
  nor: chipKind('nor'),
  xor: chipKind('xor'),
  xnor: chipKind('xnor'),
  mux: chipKind('mux'),
  demux: chipKind('demux'),
  decoder: chipKind('decoder'),
  mux4: chipKind('mux4'),
  halfAdder: chipKind('half-adder'),
  fullAdder: chipKind('full-adder'),
  adder4: chipKind('adder4'),
  sub4: chipKind('sub4'),
  srLatch: chipKind('sr-latch'),
  dLatch: chipKind('d-latch'),
  dff: chipKind('dff'),
  register: chipKind('register'),
  register4: chipKind('register4'),
  ram: chipKind('ram4x4'),
} as const satisfies Record<string, ChipKind>;

/** Adds a part and wires its inputs: `part(b, CHIP.and, { A: x, B: y })`. */
export function part(
  b: CircuitBuilder,
  kind: ComponentKind,
  inputs: Record<string, Pin> = {},
): PartHandle {
  const handle = b.add(kind);
  for (const [pin, source] of Object.entries(inputs)) b.wire(source, handle.in(pin));
  return handle;
}

export const nand = (b: CircuitBuilder, x: Pin, y: Pin) =>
  part(b, 'nand', { a: x, b: y }).out('out');

const gate2 = (kind: ChipKind) => (b: CircuitBuilder, x: Pin, y: Pin) =>
  part(b, kind, { A: x, B: y }).out('OUT');

export const not = (b: CircuitBuilder, x: Pin) => part(b, CHIP.not, { A: x }).out('OUT');
export const and = gate2(CHIP.and);
export const or = gate2(CHIP.or);
export const nor = gate2(CHIP.nor);
export const xor = gate2(CHIP.xor);
