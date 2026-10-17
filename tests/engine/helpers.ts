/** Shared helpers for engine tests. */
import { buildCircuit } from '../../src/engine/builder.ts';
import type { CircuitBuilder, LevelIo } from '../../src/engine/builder.ts';
import { compile } from '../../src/engine/compile.ts';
import type { PinRef } from '../../src/engine/model.ts';
import type { ComponentResolver } from '../../src/engine/primitives.ts';
import { primitiveResolver } from '../../src/engine/primitives.ts';
import { Simulator } from '../../src/engine/simulate.ts';

type Pin = PinRef | string;

/** Builds, compiles and wraps a circuit in a simulator; throws if it doesn't compile. */
export function simulate(
  io: LevelIo,
  recipe: (b: CircuitBuilder) => void,
  resolver: ComponentResolver = primitiveResolver,
): Simulator {
  const result = compile(buildCircuit(io, recipe, resolver), resolver);
  if (!result.ok) throw new Error(result.validation.issues.map((i) => i.message).join('; '));
  return new Simulator(result.netlist);
}

// Gate recipes from NAND, for building test circuits. Each returns its output pin.

export function not(b: CircuitBuilder, x: Pin): PinRef {
  const g = b.add('nand');
  b.wire(x, g.in('a'));
  b.wire(x, g.in('b'));
  return g.out('out');
}

export function nand(b: CircuitBuilder, x: Pin, y: Pin): PinRef {
  const g = b.add('nand');
  b.wire(x, g.in('a'));
  b.wire(y, g.in('b'));
  return g.out('out');
}

export const and = (b: CircuitBuilder, x: Pin, y: Pin) => not(b, nand(b, x, y));
export const or = (b: CircuitBuilder, x: Pin, y: Pin) => nand(b, not(b, x), not(b, y));
export const nor = (b: CircuitBuilder, x: Pin, y: Pin) => not(b, or(b, x, y));

/** XOR from four NANDs. */
export function xor(b: CircuitBuilder, x: Pin, y: Pin): PinRef {
  const n1 = nand(b, x, y);
  return nand(b, nand(b, x, n1), nand(b, n1, y));
}
