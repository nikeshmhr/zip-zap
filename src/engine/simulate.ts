/**
 * Unit-delay, event-driven simulation (plan §4.4, spec §5.3).
 *
 * Each tick evaluates every component whose inputs changed, then applies all output changes
 * at once, so every component takes exactly one tick to respond. A net driven by several
 * joined relay outputs is ON if any of them is ON.
 */
import type { Netlist } from './compile.ts';
import type { Bit, Bits } from './model.ts';

export interface SettleResult {
  stable: boolean;
  /** Ticks run before the circuit settled, or the limit if it didn't. */
  ticks: number;
}

/** Generous for any acyclic depth, short enough to catch oscillation quickly. */
export const defaultMaxTicks = (netlist: Netlist) => 64 + 4 * netlist.components.length;

export class Simulator {
  readonly netlist: Netlist;
  private readonly netValues: Uint8Array;
  private readonly outValues: Uint8Array[];
  private readonly states: unknown[];
  private readonly dirtyFlags: Uint8Array;
  private dirtyList: number[] = [];

  constructor(netlist: Netlist) {
    this.netlist = netlist;
    this.netValues = new Uint8Array(netlist.netCount);
    this.outValues = netlist.components.map((c) => new Uint8Array(c.def.outputs.length));
    this.states = new Array<unknown>(netlist.components.length);
    this.dirtyFlags = new Uint8Array(netlist.components.length);
    this.reset();
  }

  /**
   * Powers everything off: all nets and outputs OFF, component state re-initialised, and every
   * component scheduled for evaluation. Nothing is evaluated until the next tick, so inputs
   * set straight after a reset apply from the very first tick.
   */
  reset(): void {
    this.netValues.fill(0);
    this.dirtyList = [];
    this.netlist.components.forEach((c, i) => {
      this.outValues[i]!.fill(0);
      this.states[i] = c.def.init();
      this.dirtyFlags[i] = 1;
      this.dirtyList.push(i);
    });
  }

  /** Sets level inputs by pin name. Unknown names throw, to catch typos in tests and levels. */
  setInputs(bits: Readonly<Partial<Bits>>): void {
    for (const [name, value] of Object.entries(bits)) {
      const net = this.netlist.inputNets.get(name);
      if (net === undefined) throw new Error(`Unknown level input "${name}"`);
      if (value === undefined || this.netValues[net] === value) continue;
      this.netValues[net] = value;
      this.markReaders(net);
    }
  }

  /** Whether no component is waiting to be evaluated. */
  get isStable(): boolean {
    return this.dirtyList.length === 0;
  }

  /** Runs one tick. Returns false if there was nothing to do (already stable). */
  tick(): boolean {
    const evaluate = this.dirtyList;
    if (evaluate.length === 0) return false;
    this.dirtyList = [];
    for (const i of evaluate) this.dirtyFlags[i] = 0;

    // Compute phase: read current nets, collect output changes.
    const { components } = this.netlist;
    const changes: number[] = [];
    for (const i of evaluate) {
      const comp = components[i]!;
      const inputs = Array.from(comp.inputNets, (net) => this.netValues[net] as Bit);
      const result = comp.def.step(inputs, this.states[i]);
      this.states[i] = result.state;
      const current = this.outValues[i]!;
      result.outputs.forEach((value, k) => {
        if (current[k] !== value) changes.push(i, k, value);
      });
    }

    // Apply phase: update outputs, then recompute every affected net.
    const touched = new Set<number>();
    for (let n = 0; n < changes.length; n += 3) {
      const i = changes[n]!;
      const k = changes[n + 1]!;
      this.outValues[i]![k] = changes[n + 2]!;
      touched.add(components[i]!.outputNets[k]!);
    }
    for (const net of touched) {
      const value = this.driveValue(net);
      if (this.netValues[net] !== value) {
        this.netValues[net] = value;
        this.markReaders(net);
      }
    }
    return true;
  }

  /** Ticks until nothing changes, or reports the circuit unstable after `maxTicks`. */
  settle(maxTicks = defaultMaxTicks(this.netlist)): SettleResult {
    let ticks = 0;
    while (!this.isStable) {
      if (ticks === maxTicks) return { stable: false, ticks };
      this.tick();
      ticks++;
    }
    return { stable: true, ticks };
  }

  /** Current values of all level outputs. */
  readOutputs(): Bits {
    const bits: Bits = {};
    for (const [name, net] of this.netlist.outputNets) bits[name] = this.netValues[net] as Bit;
    return bits;
  }

  /** Current value of a net (for wire rendering). */
  netValue(net: number): Bit {
    return this.netValues[net] as Bit;
  }

  private driveValue(net: number): 0 | 1 {
    const drivers = this.netlist.netDrivers[net]!;
    for (let d = 0; d < drivers.length; d += 2) {
      if (this.outValues[drivers[d]!]![drivers[d + 1]!]) return 1;
    }
    return 0;
  }

  private markReaders(net: number): void {
    for (const reader of this.netlist.netReaders[net]!) {
      if (this.dirtyFlags[reader]) continue;
      this.dirtyFlags[reader] = 1;
      this.dirtyList.push(reader);
    }
  }
}
