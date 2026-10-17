/**
 * Live simulation for the editor (spec §4 step 3). Keeps one simulator per circuit version, so
 * toggling an input continues from the current state (a latch remembers) instead of
 * restarting; editing the circuit powers it on afresh.
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

export class LiveSimulation {
  private circuit: Circuit | null = null;
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
    if (circuit !== this.circuit) this.load(circuit);
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
    return {
      status: stable ? 'ok' : 'unstable',
      issues: [],
      flaggedWires: EMPTY,
      flaggedParts: EMPTY,
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

  private load(circuit: Circuit) {
    this.circuit = circuit;
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
