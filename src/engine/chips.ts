/**
 * Chips: reusable components defined by their level's specification (spec §5.4, plan §4.2).
 * A chip is simulated as one component with a one-tick delay, never by expanding the
 * player's design inside it.
 */
import type { Bit, Bits, ChipId, ComponentKind } from './model.ts';
import { chipKind, toBit } from './model.ts';
import type { ComponentDef, ComponentResolver } from './primitives.ts';
import { primitiveResolver } from './primitives.ts';

/** Pure function from input pins to output pins. Missing outputs read as 0. */
export type CombFn = (inputs: Bits) => Bits;

/**
 * A state machine evaluated whenever any input changes. Also used as the reference model
 * that produces expected outputs in sequential level tests.
 */
export interface SeqModel<S = unknown> {
  init(): S;
  step(inputs: Bits, state: S): { outputs: Bits; state: S };
}

export type ChipBehavior =
  { kind: 'combinational'; fn: CombFn } | { kind: 'sequential'; model: SeqModel };

export interface ChipDef {
  id: ChipId;
  name: string;
  inputs: readonly string[];
  outputs: readonly string[];
  behavior: ChipBehavior;
}

const toRecord = (names: readonly string[], values: readonly Bit[]): Bits => {
  const bits: Bits = {};
  names.forEach((name, i) => (bits[name] = values[i] ?? 0));
  return bits;
};

const toArray = (names: readonly string[], bits: Bits): Bit[] =>
  names.map((name) => toBit(bits[name]));

export function chipComponentDef(chip: ChipDef): ComponentDef {
  const { inputs, outputs, behavior } = chip;
  const base = { kind: chipKind(chip.id), inputs, outputs };

  if (behavior.kind === 'combinational') {
    return {
      ...base,
      init: () => null,
      step: (values) => ({
        outputs: toArray(outputs, behavior.fn(toRecord(inputs, values))),
        state: null,
      }),
    };
  }

  const { model } = behavior;
  return {
    ...base,
    init: () => model.init(),
    step: (values, state) => {
      const result = model.step(toRecord(inputs, values), state);
      return { outputs: toArray(outputs, result.outputs), state: result.state };
    },
  };
}

/** Resolves primitives plus the given chips. Duplicate chip ids throw. */
export function createResolver(chips: Iterable<ChipDef>): ComponentResolver {
  const defs = new Map<ComponentKind, ComponentDef>();
  for (const chip of chips) {
    const kind = chipKind(chip.id);
    if (defs.has(kind)) throw new Error(`Duplicate chip id "${chip.id}"`);
    defs.set(kind, chipComponentDef(chip));
  }
  return (kind) => primitiveResolver(kind) ?? defs.get(kind);
}
