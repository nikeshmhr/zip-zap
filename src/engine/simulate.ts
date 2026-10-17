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
   * Powers the circuit on from scratch: component state re-initialised, all inputs OFF, then a
   * power-on settle so the next inputs apply to a settled circuit (no start-up glitches).
   *
   * Power-on evaluates components one at a time in a fixed order rather than all at once, so a
   * symmetric latch settles into a definite (if arbitrary) state instead of oscillating, much as
   * real hardware resolves metastability. Circuits that still don't settle (e.g. a ring
   * oscillator) are left pending, so the next `settle` reports them unstable.
   */
  reset(): void {
    this.netValues.fill(0);
    this.dirtyList = [];
    this.dirtyFlags.fill(0);
    this.netlist.components.forEach((c, i) => {
      this.outValues[i]!.fill(0);
      this.states[i] = c.def.init();
    });
    this.powerOn();
  }

  private powerOn(): void {
    const { components } = this.netlist;
    const maxPasses = defaultMaxTicks(this.netlist);
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false;
      for (let i = 0; i < components.length; i++) {
        for (const net of this.evaluate(i)) {
          const value = this.driveValue(net);
          if (this.netValues[net] !== value) {
            this.netValues[net] = value;
            changed = true;
          }
        }
      }
      if (!changed && pass > 0) return;
    }
    // Didn't settle: leave every component pending.
    for (let i = 0; i < components.length; i++) {
      this.dirtyFlags[i] = 1;
      this.dirtyList.push(i);
    }
  }

  /**
   * Evaluates one component against the current nets, updating its state and outputs.
   * Returns the nets whose drivers changed.
   */
  private evaluate(i: number): number[] {
    const comp = this.netlist.components[i]!;
    const inputs = Array.from(comp.inputNets, (net) => this.netValues[net] as Bit);
    const result = comp.def.step(inputs, this.states[i]);
    this.states[i] = result.state;
    const current = this.outValues[i]!;
    const touched: number[] = [];
    result.outputs.forEach((value, k) => {
      if (current[k] === value) return;
      current[k] = value;
      touched.push(comp.outputNets[k]!);
    });
    return touched;
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

    // Compute phase: every component reads the nets as they were at the start of the tick.
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
