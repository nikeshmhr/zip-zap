/**
 * Chapter 2: Routing. Choosing which signal goes where (spec §6).
 */
import { toBit } from '../../engine/model.ts';
import { CHIP, and, not, or, part } from '../recipes.ts';
import type { LevelDef } from '../types.ts';

export const CH2: LevelDef[] = [
  {
    id: '2.1',
    chapter: 2,
    title: 'Mux',
    summary: 'Send A to OUT when SEL is OFF, and B when SEL is ON.',
    inputs: ['A', 'B', 'SEL'],
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A, B, SEL }) => ({ OUT: SEL ? toBit(B) : toBit(A) }) },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.mux, name: 'Mux' },
    concept: `A **multiplexer** ("mux") is a signal switch. The **select** input SEL decides which data input reaches the output: A when SEL is OFF, B when it's ON. The other input is simply ignored.

Inside a computer, muxes are everywhere: whenever two values compete for one wire, a mux decides which one wins.`,
    hints: [
      'Split it into two cases: "A, and SEL is OFF" or "B, and SEL is ON".',
      'AND each data input with SEL or with NOT SEL, then OR the two results.',
    ],
    reference: (b) => {
      const pickA = and(b, 'A', not(b, 'SEL'));
      const pickB = and(b, 'B', 'SEL');
      b.wire(or(b, pickA, pickB), 'OUT');
    },
  },
  {
    id: '2.2',
    chapter: 2,
    title: 'Demux',
    summary:
      'Send IN to output A when SEL is OFF, or to B when SEL is ON. The other output stays OFF.',
    inputs: ['IN', 'SEL'],
    outputs: ['A', 'B'],
    goal: {
      kind: 'combinational',
      fn: ({ IN, SEL }) => ({ A: toBit(IN && !SEL), B: toBit(IN && SEL) }),
    },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.demux, name: 'Demux' },
    concept: `A **demultiplexer** does the reverse of a mux: one input, routed to one of several outputs.

Think of a railway junction. SEL sets the points, and the signal travels down exactly one track. The other track stays dark.

This is your first level with two outputs. Each output has its own column in the truth table.`,
    hints: [
      'Output A should carry IN only while SEL is OFF.',
      "A needs IN *and* 'SEL is OFF' at the same time. B needs IN and 'SEL is ON'.",
    ],
    reference: (b) => {
      b.wire(and(b, 'IN', not(b, 'SEL')), 'A');
      b.wire(and(b, 'IN', 'SEL'), 'B');
    },
  },
  {
    id: '2.3',
    chapter: 2,
    title: 'Decoder',
    summary: 'Read A1 A0 as a number from 0 to 3, and turn on only the matching output Y0–Y3.',
    inputs: ['A1', 'A0'],
    outputs: ['Y0', 'Y1', 'Y2', 'Y3'],
    goal: {
      kind: 'combinational',
      fn: ({ A1 = 0, A0 = 0 }) => {
        const n = A1 * 2 + A0;
        return { Y0: toBit(n === 0), Y1: toBit(n === 1), Y2: toBit(n === 2), Y3: toBit(n === 3) };
      },
    },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.decoder, name: 'Decoder' },
    concept: `Two wires can represent four numbers in **binary**. A1 is worth 2 and A0 is worth 1, so A1 A0 = \`10\` means 2.

A **decoder** turns that binary number into a single ON wire: output Y2 lights when the input is 2.

This is how memory picks a location. The address goes into a decoder, and exactly one word of memory is selected. You'll use this in your RAM.`,
    hints: [
      'Each output matches exactly one combination of A1 and A0.',
      'Y0 = NOT A1 AND NOT A0. For the others, use A1 or A0 directly wherever that bit should be ON.',
    ],
    reference: (b) => {
      const n1 = not(b, 'A1');
      const n0 = not(b, 'A0');
      b.wire(and(b, n1, n0), 'Y0');
      b.wire(and(b, n1, 'A0'), 'Y1');
      b.wire(and(b, 'A1', n0), 'Y2');
      b.wire(and(b, 'A1', 'A0'), 'Y3');
    },
  },
  {
    id: '2.4',
    chapter: 2,
    title: '4-way Mux',
    summary: 'Send one of D0–D3 to OUT, chosen by the number S1 S0.',
    inputs: ['S1', 'S0', 'D0', 'D1', 'D2', 'D3'],
    outputs: ['OUT'],
    goal: {
      kind: 'combinational',
      fn: (bits) => ({ OUT: toBit(bits[`D${(bits.S1 ?? 0) * 2 + (bits.S0 ?? 0)}`]) }),
      display: { formula: 'OUT = D[S], where S = S1 S0 in binary (0–3)' },
    },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.mux4, name: '4-way Mux' },
    concept: `Now choose one of **four** inputs, using two select bits as a number from 0 to 3.

This truth table has 64 rows, too many to read, so the goal is shown as a rule instead. Every row is still tested.

You could design it from scratch, but you don't have to. Big circuits are built from small ones: a **tree** of the 2-way muxes you already have does the job.`,
    hints: [
      'S0 can choose within each pair of inputs, and S1 can choose between the pairs.',
      'Use two Mux chips on S0 (one for D0/D1, one for D2/D3), then a third Mux on S1.',
    ],
    reference: (b) => {
      const low = part(b, CHIP.mux, { A: 'D0', B: 'D1', SEL: 'S0' }).out('OUT');
      const high = part(b, CHIP.mux, { A: 'D2', B: 'D3', SEL: 'S0' }).out('OUT');
      b.wire(part(b, CHIP.mux, { A: low, B: high, SEL: 'S1' }).out('OUT'), 'OUT');
    },
  },
];
