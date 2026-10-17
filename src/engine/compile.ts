/**
 * Circuit → flat netlist for fast simulation (plan §4.3).
 */
import type { Circuit } from './model.ts';
import { pinKey } from './nets.ts';
import type { ComponentDef, ComponentResolver } from './primitives.ts';
import type { ValidateOptions, Validation } from './validate.ts';
import { validate } from './validate.ts';

export interface CompiledComponent {
  id: string;
  def: ComponentDef;
  /** Net index for each input pin, in `def.inputs` order. */
  inputNets: Int32Array;
  /** Net index for each output pin, in `def.outputs` order. */
  outputNets: Int32Array;
}

export interface Netlist {
  /** Simulated components; level IO is external and not included. */
  components: CompiledComponent[];
  netCount: number;
  /** Per net: flattened `[component, outputIndex, …]` pairs of simulated drivers. */
  netDrivers: Int32Array[];
  /** Per net: indices of simulated components that read it (each listed once). */
  netReaders: Int32Array[];
  /** Level input pin name → the net it drives. */
  inputNets: Map<string, number>;
  /** Level output pin name → the net it reads. */
  outputNets: Map<string, number>;
}

export type CompileResult =
  { ok: true; netlist: Netlist; validation: Validation } | { ok: false; validation: Validation };

export function compile(
  circuit: Circuit,
  resolve: ComponentResolver,
  options?: ValidateOptions,
): CompileResult {
  const validation = validate(circuit, resolve, options);
  if (!validation.ok) return { ok: false, validation };
  const { defs, nets, netOf } = validation;

  const netIndex = (comp: string, pin: string) => netOf.get(pinKey({ comp, pin }))!;

  const components: CompiledComponent[] = [];
  const inputNets = new Map<string, number>();
  const outputNets = new Map<string, number>();
  const compIndex = new Map<string, number>();

  for (const c of circuit.components) {
    const def = defs.get(c.id)!;
    if (c.kind === 'in') {
      inputNets.set(c.label ?? c.id, netIndex(c.id, 'out'));
    } else if (c.kind === 'out') {
      outputNets.set(c.label ?? c.id, netIndex(c.id, 'in'));
    } else {
      compIndex.set(c.id, components.length);
      components.push({
        id: c.id,
        def,
        inputNets: Int32Array.from(def.inputs, (pin) => netIndex(c.id, pin)),
        outputNets: Int32Array.from(def.outputs, (pin) => netIndex(c.id, pin)),
      });
    }
  }

  const netDrivers = nets.map((net) => {
    const pairs: number[] = [];
    for (const d of net.drivers) {
      const ci = compIndex.get(d.comp);
      if (ci === undefined) continue; // external (level input)
      pairs.push(ci, components[ci]!.def.outputs.indexOf(d.pin));
    }
    return Int32Array.from(pairs);
  });

  const netReaders = nets.map((net) => {
    const readers = new Set<number>();
    for (const r of net.readers) {
      const ci = compIndex.get(r.comp);
      if (ci !== undefined) readers.add(ci);
    }
    return Int32Array.from(readers);
  });

  return {
    ok: true,
    validation,
    netlist: { components, netCount: nets.length, netDrivers, netReaders, inputNets, outputNets },
  };
}
