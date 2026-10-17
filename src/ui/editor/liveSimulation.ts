/**
 * Live simulation for the editor (spec §4 step 3). Keeps one simulator per circuit topology, so
 * toggling an input or moving a part continues from the current state (a latch remembers);
 * changing parts or wires powers it on afresh.
 */
import { compile } from '../../engine/compile.ts';
import type { Bit, Bits, Circuit } from '../../engine/model.ts';
import { pinKey } from '../../engine/nets.ts';
import type { ComponentResolver } from '../../engine/primitives.ts';
import { Simulator } from '../../engine/simulate.ts';
import type { Issue, ValidateOptions } from '../../engine/validate.ts';

export type LiveStatus = 'ok' | 'unstable' | 'short' | 'invalid';

export interface LiveSnapshot {
  status: LiveStatus;
  issues: readonly Issue[];
  /** Value of a pin, by component id and pin name. */
  pin(comp: string, pin: string): Bit;
  flaggedWires: ReadonlySet<string>;
  flaggedParts: ReadonlySet<string>;
}

const OFF = () => 0 as Bit;
const EMPTY = new Set<string>();

/** What the simulation depends on: parts and wires, but not layout. */
export function topologyKey(circuit: Circuit): string {
  const parts = circuit.components.map((c) => `${c.id}:${c.kind}:${c.label ?? ''}`).join(',');
  const wires = circuit.wires
    .map((w) => `${w.from.comp}.${w.from.pin}>${w.to.comp}.${w.to.pin}`)
    .join(',');
  return `${parts}|${wires}`;
}

export class LiveSimulation {
  private circuit: Circuit | null = null;
  private topology = '';
  private sim: Simulator | null = null;
  private netOf: Map<string, number> | null = null;
  private applied: Bits = {};
  private failure: Omit<LiveSnapshot, 'pin'> | null = null;

  private readonly resolve: ComponentResolver;
  private readonly options?: ValidateOptions;

  constructor(resolve: ComponentResolver, options?: ValidateOptions) {
    this.resolve = resolve;
    this.options = options;
  }

  evaluate(circuit: Circuit, inputs: Readonly<Bits>): LiveSnapshot {
    if (circuit !== this.circuit) {
      const topology = topologyKey(circuit);
      if (topology !== this.topology) this.load(circuit, topology);
      this.circuit = circuit;
    }
    if (this.failure) return { ...this.failure, pin: OFF };

    const sim = this.sim!;
    const changed: Bits = {};
    for (const name of sim.netlist.inputNets.keys()) {
      const value = inputs[name] ?? 0;
      if (this.applied[name] !== value) changed[name] = value;
    }
    sim.setInputs(changed);
    Object.assign(this.applied, changed);
    const { stable } = sim.settle();

    const netOf = this.netOf!;
    const values = new Map<number, Bit>();
    let flaggedParts: ReadonlySet<string> = EMPTY;
    let flaggedWires: ReadonlySet<string> = EMPTY;
    if (!stable) {
      const looping = new Set(sim.pendingComponents());
      flaggedParts = looping;
      flaggedWires = new Set(
        circuit.wires.filter((w) => looping.has(w.from.comp)).map((w) => w.id),
      );
    }
    return {
      status: stable ? 'ok' : 'unstable',
      issues: [],
      flaggedWires,
      flaggedParts,
      // Snapshot the values now: the simulator keeps running as inputs change.
      pin: (comp, pin) => {
        const net = netOf.get(pinKey({ comp, pin }));
        if (net === undefined) return 0;
        let value = values.get(net);
        if (value === undefined) {
          value = sim.netValue(net);
          values.set(net, value);
        }
        return value;
      },
    };
  }

  private load(circuit: Circuit, topology: string) {
    this.topology = topology;
    this.applied = {};
    const result = compile(circuit, this.resolve, this.options);
    if (!result.ok) {
      const { issues } = result.validation;
      this.sim = null;
      this.netOf = null;
      this.failure = {
        status: issues.some((i) => i.severity === 'invalid') ? 'invalid' : 'short',
        issues,
        flaggedWires: new Set(issues.flatMap((i) => i.wires ?? [])),
        flaggedParts: new Set(issues.flatMap((i) => i.components ?? [])),
      };
      return;
    }
    this.failure = null;
    this.sim = new Simulator(result.netlist);
    this.netOf = result.validation.netOf;
  }
}
