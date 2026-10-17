/**
 * Chapter 4: Memory. Feedback, the clock, registers and a tiny RAM (spec §6, §15.7).
 *
 * Sequence conventions:
 * - Step 0 sets every input. Where the power-on state is arbitrary (flip-flops and up), the
 *   sequence starts with warm-up steps (`expect: {}`) that clock in a known value.
 * - A step that changes the clock changes nothing else.
 * - Control inputs (LOAD, address) only change while the clock is low, so designs that gate the
 *   clock aren't failed in the MVP. Data may change while the clock is high; that is how the
 *   tests tell an edge-triggered flip-flop from a latch.
 */
import type { SeqModel } from '../../engine/chips.ts';
import type { Bit, Bits, PinRef } from '../../engine/model.ts';
import { readBus, toBit, writeBus } from '../../engine/model.ts';
import type { Step } from '../../engine/testRunner.ts';
import { CHIP, and, not, part } from '../recipes.ts';
import type { LevelDef } from '../types.ts';

const BITS = [0, 1, 2, 3] as const;
const msbFirst = (prefix: string) => BITS.map((i) => `${prefix}${3 - i}`);
const word = (prefix: string, value: number): Bits => writeBus(prefix, 4, value);
const address = (n: number): Bits => ({ A1: toBit(n & 2), A0: toBit(n & 1) });

/** A rising then falling clock edge. Warm-up pulses check only stability. */
const pulse = (check = true): Step[] =>
  check
    ? [{ set: { CLK: 1 } }, { set: { CLK: 0 } }]
    : [
        { set: { CLK: 1 }, expect: {} },
        { set: { CLK: 0 }, expect: {} },
      ];

/** Edge-triggered storage of `width` bits with an optional LOAD enable. */
interface Stored {
  value: number;
  prevClk: Bit;
}

const registerModel = (width: 1 | 4, hasLoad: boolean): SeqModel<Stored> => ({
  init: () => ({ value: 0, prevClk: 0 }),
  step: (inputs, { value, prevClk }) => {
    const clk = inputs.CLK ?? 0;
    const load = !hasLoad || inputs.LOAD === 1;
    const d = width === 1 ? (inputs.D ?? 0) : readBus(inputs, 'D', 4);
    const next = !prevClk && clk && load ? d : value;
    const outputs = width === 1 ? { Q: toBit(next) } : word('Q', next);
    return { outputs, state: { value: next, prevClk: clk } };
  },
});

interface RamState {
  words: readonly number[];
  prevClk: Bit;
}

const ramModel: SeqModel<RamState> = {
  init: () => ({ words: [0, 0, 0, 0], prevClk: 0 }),
  step: (inputs, { words, prevClk }) => {
    const clk = inputs.CLK ?? 0;
    const addr = (inputs.A1 ?? 0) * 2 + (inputs.A0 ?? 0);
    let next = words;
    if (!prevClk && clk && inputs.LOAD) {
      next = words.map((w, i) => (i === addr ? readBus(inputs, 'D', 4) : w));
    }
    return { outputs: word('Q', next[addr]!), state: { words: next, prevClk: clk } };
  },
};

/** RAM write: set address and data with LOAD on (clock low), then pulse the clock. */
const write = (addr: number, value: number, check = true): Step[] => [
  { set: { ...address(addr), ...word('D', value), LOAD: 1 }, ...(check ? {} : { expect: {} }) },
  ...pulse(check),
];

const read = (addr: number): Step => ({ set: { ...address(addr), LOAD: 0 } });

export const CH4: LevelDef[] = [
  {
    id: '4.1',
    chapter: 4,
    title: 'SR Latch',
    summary: 'S (set) turns Q ON, R (reset) turns Q OFF, and with both OFF, Q keeps its value.',
    inputs: ['S', 'R'],
    outputs: ['Q'],
    goal: {
      kind: 'sequential',
      model: {
        init: () => 0,
        step: ({ S, R }, q: Bit) => {
          const next: Bit = R ? 0 : S ? 1 : q;
          return { outputs: { Q: next }, state: next };
        },
      } satisfies SeqModel<Bit>,
      sequences: [
        [
          { set: { S: 0, R: 1 } },
          { set: { R: 0 } },
          { set: { S: 1 } },
          { set: { S: 0 } },
          { set: { R: 1 } },
          { set: { R: 0 } },
          { set: { S: 1 } },
          { set: { S: 0 } },
        ],
        [{ set: { S: 1, R: 0 } }, { set: { S: 0 } }, { set: { R: 1 } }, { set: { R: 0 } }],
      ],
    },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.srLatch, name: 'SR Latch' },
    concept: `Until now, outputs depended only on the inputs *right now*. To **remember**, a circuit needs **feedback**: an output wired back into an earlier input, so the circuit can hold itself in place.

Two cross-coupled NOR gates make a **latch**. S (set) turns Q ON, R (reset) turns Q OFF, and when both are OFF, Q keeps whatever it was.

Never turn S and R ON together. Tests now run as **steps** over time. If a circuit never settles, it's **oscillating**; check your loops.`,
    hints: [
      'Q has to be able to keep itself ON. Something must feed back into something else.',
      'Use two NOR gates, each output feeding one input of the other. R goes into the gate that drives Q.',
    ],
    reference: (b) => {
      const top = part(b, CHIP.nor, { A: 'R' });
      const bottom = part(b, CHIP.nor, { A: 'S' });
      b.wire(bottom.out('OUT'), top.in('B'));
      b.wire(top.out('OUT'), bottom.in('B'));
      b.wire(top.out('OUT'), 'Q');
    },
  },
  {
    id: '4.2',
    chapter: 4,
    title: 'D Latch',
    summary: 'While EN is ON, Q follows D. While EN is OFF, Q holds its last value.',
    inputs: ['D', 'EN'],
    outputs: ['Q'],
    goal: {
      kind: 'sequential',
      model: {
        init: () => 0,
        step: ({ D = 0, EN }, q: Bit) => {
          const next: Bit = EN ? D : q;
          return { outputs: { Q: next }, state: next };
        },
      } satisfies SeqModel<Bit>,
      sequences: [
        [
          { set: { D: 0, EN: 1 } },
          { set: { D: 1 } },
          { set: { D: 0 } },
          { set: { D: 1 } },
          { set: { EN: 0 } },
          { set: { D: 0 } },
          { set: { D: 1 } },
          { set: { D: 0 } },
          { set: { EN: 1 } },
          { set: { EN: 0 } },
          { set: { D: 1 } },
          { set: { EN: 1 } },
        ],
      ],
    },
    clock: { pin: 'EN' },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.dLatch, name: 'D Latch' },
    concept: `An SR latch needs two separate wires to set and reset it. A **D latch** is easier to use: one **data** input D and an **enable** input EN.

While EN is ON the latch is *transparent* and Q simply follows D. When EN turns OFF, Q freezes at the last value of D and ignores any further changes.

That's one bit of memory with a "save" button.`,
    hints: [
      'Drive your SR latch: set it when D is ON and reset it when D is OFF, but only while EN is ON.',
      'S = D AND EN, and R = (NOT D) AND EN.',
    ],
    reference: (b) => {
      const s = and(b, 'D', 'EN');
      const r = and(b, not(b, 'D'), 'EN');
      b.wire(part(b, CHIP.srLatch, { S: s, R: r }).out('Q'), 'Q');
    },
  },
  {
    id: '4.3',
    chapter: 4,
    title: 'D Flip-Flop',
    summary: 'Q takes the value of D only at the moment CLK turns ON. At all other times it holds.',
    inputs: ['D', 'CLK'],
    outputs: ['Q'],
    goal: {
      kind: 'sequential',
      model: registerModel(1, false),
      sequences: [
        [
          { set: { D: 0, CLK: 0 }, expect: {} },
          ...pulse(),
          { set: { D: 1 } },
          ...pulse(),
          { set: { D: 0 } },
          { set: { CLK: 1 } },
          { set: { D: 1 } }, // clock high: D changes are ignored
          { set: { D: 0 } },
          { set: { CLK: 0 } },
          { set: { D: 1 } },
          { set: { CLK: 1 } },
          { set: { D: 0 } },
          { set: { CLK: 0 } },
        ],
      ],
    },
    clock: { pin: 'CLK' },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.dff, name: 'D Flip-Flop' },
    concept: `Computers move in lock-step to a **clock**: a signal that flips OFF and ON billions of times a second.

A **flip-flop** reads D only at the instant CLK turns ON (the **rising edge**) and ignores D the rest of the time. Every part of a computer can then update at the same moment, without signals racing each other.

The trick: two latches in a row, open at opposite times, like an airlock.

At power-on, Q may start either way; the first clock pulse sets it.`,
    hints: [
      "Use two D latches: a 'leader' that's open while the clock is OFF, and a 'follower' that's open while it's ON.",
      'Leader: EN = NOT CLK. Follower: EN = CLK. Now, what should each latch’s D read?',
    ],
    reference: (b) => {
      const leader = part(b, CHIP.dLatch, { D: 'D', EN: not(b, 'CLK') });
      const follower = part(b, CHIP.dLatch, { D: leader.out('Q'), EN: 'CLK' });
      b.wire(follower.out('Q'), 'Q');
    },
  },
  {
    id: '4.4',
    chapter: 4,
    title: 'Register',
    summary: 'When CLK turns ON, store D if LOAD is ON. Otherwise keep the stored value.',
    inputs: ['D', 'LOAD', 'CLK'],
    outputs: ['Q'],
    goal: {
      kind: 'sequential',
      model: registerModel(1, true),
      sequences: [
        [
          { set: { D: 0, LOAD: 1, CLK: 0 }, expect: {} },
          ...pulse(),
          { set: { D: 1, LOAD: 0 } },
          ...pulse(), // not loaded
          { set: { LOAD: 1 } },
          { set: { CLK: 1 } },
          { set: { D: 0 } }, // clock high: D ignored
          { set: { CLK: 0 } },
          { set: { LOAD: 0 } },
          ...pulse(), // keeps 1
          { set: { LOAD: 1 } },
          ...pulse(), // loads 0
        ],
      ],
    },
    clock: { pin: 'CLK', holdWhileHigh: ['LOAD'] },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.register, name: 'Register' },
    concept: `A flip-flop stores a new value on *every* clock edge. A **register** stores one only when told to: on the clock edge it loads D if **LOAD** is ON, and otherwise keeps its value.

Tempting shortcut: switch the clock off with an AND gate. This level accepts it, and it even saves gates, but designers treat "clock gating" with care: the extra gate delays the clock, and a LOAD change while the clock is ON can create a false edge. The safer habit is to let the flip-flop clock every time and choose *what* it stores.`,
    hints: [
      'On every clock edge the flip-flop stores something. When LOAD is OFF, what should that be?',
      "Put a Mux in front of the flip-flop. SEL = LOAD chooses between the flip-flop's own Q (keep) and D (new).",
    ],
    reference: (b) => {
      const ff = b.add(CHIP.dff);
      const choose = part(b, CHIP.mux, { A: ff.out('Q'), B: 'D', SEL: 'LOAD' });
      b.wire(choose.out('OUT'), ff.in('D'));
      b.wire('CLK', ff.in('CLK'));
      b.wire(ff.out('Q'), 'Q');
    },
  },
  {
    id: '4.5',
    chapter: 4,
    title: '4-bit Register',
    summary:
      'When CLK turns ON, store the 4-bit number D if LOAD is ON. Q shows the stored number.',
    inputs: [...msbFirst('D'), 'LOAD', 'CLK'],
    outputs: msbFirst('Q'),
    goal: {
      kind: 'sequential',
      model: registerModel(4, true),
      sequences: [
        [
          { set: { ...word('D', 0), LOAD: 1, CLK: 0 }, expect: {} },
          ...pulse(),
          // Values chosen so every bit differs from every other bit somewhere (catches swaps).
          { set: word('D', 0b1100) },
          ...pulse(),
          // LOAD off with every bit of D different from what's stored: nothing may change.
          { set: { ...word('D', 0b0011), LOAD: 0 } },
          ...pulse(), // keeps 1100
          { set: { ...word('D', 0b0110), LOAD: 1 } },
          ...pulse(), // loads 0110
          { set: word('D', 0b1111) },
          { set: { CLK: 1 } },
          { set: word('D', 0) }, // clock high: D ignored (catches latch-based designs)
          { set: { CLK: 0 } },
          { set: { ...word('D', 0b0000), LOAD: 0 } },
          ...pulse(), // keeps 1111
        ],
      ],
    },
    clock: { pin: 'CLK', holdWhileHigh: ['LOAD'] },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.register4, name: '4-bit Register' },
    concept: `Four 1-bit registers side by side, sharing LOAD and CLK, store a whole 4-bit number. A group of bits handled together like this is called a **word**.

CPUs keep the values they're working on in registers like this one. They're the fastest memory a computer has.`,
    hints: [
      'Each bit can be stored independently of the others.',
      'Use one Register chip per bit, and connect LOAD and CLK to all four.',
    ],
    reference: (b) => {
      for (const i of BITS) {
        const reg = part(b, CHIP.register, { D: `D${i}`, LOAD: 'LOAD', CLK: 'CLK' });
        b.wire(reg.out('Q'), `Q${i}`);
      }
    },
  },
  {
    id: '4.6',
    chapter: 4,
    title: 'Tiny RAM',
    summary:
      'Four 4-bit words. Q always shows the word at address A1 A0. When CLK turns ON with LOAD ON, store D there.',
    inputs: ['A1', 'A0', ...msbFirst('D'), 'LOAD', 'CLK'],
    outputs: msbFirst('Q'),
    goal: {
      kind: 'sequential',
      model: ramModel,
      sequences: [
        [
          // Warm-up: clear every word.
          { set: { ...address(0), ...word('D', 0), LOAD: 1, CLK: 0 }, expect: {} },
          ...pulse(false),
          ...write(1, 0, false),
          ...write(2, 0, false),
          ...write(3, 0, false),
          // Every word gets a distinct, non-zero value whose bits can't be confused by a swap.
          ...write(0, 0b1001),
          ...write(1, 0b0101),
          ...write(2, 0b1010),
          ...write(3, 0b0110),
          read(0),
          read(1),
          read(2),
          read(3),
          { set: { ...address(1), ...word('D', 15), LOAD: 1 } },
          { set: { CLK: 1 } },
          { set: word('D', 0) }, // clock high: D ignored (catches latch-based designs)
          { set: { CLK: 0 } },
          read(2), // other words untouched
          read(1),
          // LOAD off at every address, with D the opposite of the stored word: nothing changes.
          ...[0b1001, 0b1111, 0b1010, 0b0110].flatMap((stored, addr): Step[] => [
            { set: { ...address(addr), ...word('D', ~stored & 0b1111), LOAD: 0 } },
            ...pulse(),
          ]),
          read(0),
          read(1),
          read(2),
          read(3),
        ],
      ],
    },
    clock: { pin: 'CLK', holdWhileHigh: ['LOAD', 'A1', 'A0'] },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.ram, name: 'RAM 4×4' },
    concept: `**RAM** (random-access memory) is many registers plus **addressing**. The address chooses one word. Writing loads only that register, and reading routes its value to Q.

Your RAM holds four 4-bit words: 16 bits of memory. Each bit is a flip-flop, built from latches, built from gates, built from NAND, built from relays. You built every layer.

Real computers have billions of bits, stored more compactly, but the addressing works exactly like this.`,
    hints: [
      'Writing: a decoder chooses which register gets LOAD. Reading: muxes choose which register reaches Q.',
      'Decode A1 A0, AND each decoder output with LOAD for one 4-bit register each. For each bit of Q, a 4-way Mux picks that bit from the four registers.',
    ],
    reference: (b) => {
      const decoder = part(b, CHIP.decoder, { A1: 'A1', A0: 'A0' });
      const data = Object.fromEntries(BITS.map((i) => [`D${i}`, `D${i}`]));
      const words = [0, 1, 2, 3].map((w) =>
        part(b, CHIP.register4, {
          ...data,
          LOAD: and(b, decoder.out(`Y${w}`), 'LOAD'),
          CLK: 'CLK',
        }),
      );
      for (const i of BITS) {
        const select: Record<string, PinRef | string> = { S1: 'A1', S0: 'A0' };
        words.forEach((reg, w) => (select[`D${w}`] = reg.out(`Q${i}`)));
        b.wire(part(b, CHIP.mux4, select).out('OUT'), `Q${i}`);
      }
    },
  },
];
