/**
 * Component definitions: the pins and behaviour of every component kind (plan §4.2).
 */
import type { Bit, ComponentKind, PrimitiveKind } from './model.ts';
import { toBit } from './model.ts';

export interface StepResult<S> {
  outputs: Bit[];
  state: S;
}

export interface ComponentDef<S = unknown> {
  kind: ComponentKind;
  /** Input pin names; `step` receives values in this order. */
  inputs: readonly string[];
  /** Output pin names; `step` returns values in this order. */
  outputs: readonly string[];
  /** Outputs may be joined with other wired-OR outputs on one net (relays only, spec §5.2). */
  wiredOrOutput?: boolean;
  /** Level IO: driven or read by the test runner rather than simulated. */
  external?: boolean;
  init(): S;
  step(inputs: readonly Bit[], state: S): StepResult<S>;
}

/** Looks up the definition for a component kind; `undefined` if unknown. */
export type ComponentResolver = (kind: ComponentKind) => ComponentDef | undefined;

/** A stateless component defined by a pure function of its inputs. */
function gate(
  kind: PrimitiveKind,
  inputs: readonly string[],
  outputs: readonly string[],
  fn: (inputs: readonly Bit[]) => Bit[],
  extra: Partial<ComponentDef<null>> = {},
): ComponentDef<null> {
  return {
    kind,
    inputs,
    outputs,
    ...extra,
    init: () => null,
    step: (values) => ({ outputs: fn(values), state: null }),
  };
}

const constant = (kind: PrimitiveKind, value: Bit) => gate(kind, [], ['out'], () => [value]);

export const PRIMITIVES: Readonly<Record<PrimitiveKind, ComponentDef<null>>> = {
  power: constant('power', 1),
  const0: constant('const0', 0),
  const1: constant('const1', 1),
  nand: gate('nand', ['a', 'b'], ['out'], ([a, b]) => [toBit(!(a && b))]),
  relayNO: gate('relayNO', ['coil', 'in'], ['out'], ([coil, input]) => [toBit(coil && input)], {
    wiredOrOutput: true,
  }),
  relayNC: gate('relayNC', ['coil', 'in'], ['out'], ([coil, input]) => [toBit(!coil && input)], {
    wiredOrOutput: true,
  }),
  in: gate('in', [], ['out'], () => [0], { external: true }),
  out: gate('out', ['in'], [], () => [], { external: true }),
};

export const isPrimitiveKind = (kind: ComponentKind): kind is PrimitiveKind => kind in PRIMITIVES;

export const primitiveResolver: ComponentResolver = (kind) =>
  isPrimitiveKind(kind) ? PRIMITIVES[kind] : undefined;
