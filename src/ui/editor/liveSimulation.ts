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
  /** Tick-by-tick mode: ticks since the inputs last changed, and the parts about to update. */
  ticking?: { ticks: number; settled: boolean; pendingParts: ReadonlySet<string> };
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
  private replayToken = 0;
  private tickMode = false;
  private tickToken = 0;
  private ticks = 0;
  private failure: Omit<LiveSnapshot, 'pin'> | null = null;

  private readonly resolve: ComponentResolver;
  private readonly options?: ValidateOptions;

  constructor(resolve: ComponentResolver, options?: ValidateOptions) {
    this.resolve = resolve;
    this.options = options;
  }

  /**
   * Simulates `circuit` with `inputs`, continuing from the current state. A new `replay`
   * request first powers the circuit on and plays its input states in order, exactly as a
   * test run does, so the circuit shows the state at a chosen step.
   */
  evaluate(
    circuit: Circuit,
    inputs: Readonly<Bits>,
    replay?: { token: number; steps: readonly Bits[] } | null,
    tick: { mode: boolean; token: number } = { mode: false, token: 0 },
  ): LiveSnapshot {
    if (circuit !== this.circuit) {
      const topology = topologyKey(circuit);
      if (topology !== this.topology) this.load(circuit, topology);
      this.circuit = circuit;
    }
    if (this.failure) return { ...this.failure, pin: OFF };
    if (replay && replay.token !== this.replayToken) {
      this.replayToken = replay.token;
      this.load(circuit, this.topology);
      for (const step of replay.steps) {
        this.sim!.setInputs(step);
        this.sim!.settle();
        Object.assign(this.applied, step);
      }
    }

    const sim = this.sim!;
    const changed: Bits = {};
    for (const name of sim.netlist.inputNets.keys()) {
      const value = inputs[name] ?? 0;
      if (this.applied[name] !== value) changed[name] = value;
    }
    sim.setInputs(changed);
    Object.assign(this.applied, changed);
    if (Object.keys(changed).length > 0) this.ticks = 0;

    // Entering tick mode doesn't advance; each later token does, by exactly one tick.
    if (tick.mode && !this.tickMode) this.tickToken = tick.token;
    this.tickMode = tick.mode;
    let stable: boolean;
    if (tick.mode) {
      if (tick.token !== this.tickToken) {
        this.tickToken = tick.token;
        if (sim.tick()) this.ticks++;
      }
      stable = true; // oscillation is something to watch here, not an error
    } else {
      stable = sim.settle().stable;
      this.ticks = 0;
    }

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
    const ticking = tick.mode
      ? {
          ticks: this.ticks,
          settled: sim.isStable,
          pendingParts: new Set(sim.pendingComponents()),
        }
      : undefined;
    return {
      status: stable ? 'ok' : 'unstable',
      issues: [],
      flaggedWires,
      flaggedParts,
      ticking,
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
