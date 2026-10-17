/**
 * Chapter 3: Arithmetic. Binary numbers, adding and subtracting (spec §6).
 */
import type { PinRef } from '../../engine/model.ts';
import { readBus, toBit, writeBus } from '../../engine/model.ts';
import { CHIP, and, not, or, part, xor } from '../recipes.ts';
import type { LevelDef } from '../types.ts';

/** Pin names most significant first, as shown in truth tables: `msbFirst('A')` → A3…A0. */
const msbFirst = (prefix: string, width = 4) =>
  Array.from({ length: width }, (_, i) => `${prefix}${width - 1 - i}`);

const BITS = [0, 1, 2, 3] as const;

export const CH3: LevelDef[] = [
  {
    id: '3.1',
    chapter: 3,
    title: 'Half Adder',
    summary: 'Add the bits A and B: SUM is the ones digit of the result, CARRY the twos digit.',
    inputs: ['A', 'B'],
    outputs: ['SUM', 'CARRY'],
    goal: {
      kind: 'combinational',
      fn: ({ A = 0, B = 0 }) => ({ SUM: toBit((A + B) & 1), CARRY: toBit(A + B > 1) }),
    },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.halfAdder, name: 'Half Adder' },
    concept: `You met **binary** in the decoder. Each digit is a wire, worth 1, 2, 4, 8… from right to left. So \`101\` is 4 + 1 = 5.

Adding two one-digit binary numbers gives at most 2, which is \`10\` in binary:

- 0 + 0 = \`00\`
- 0 + 1 = \`01\`
- 1 + 1 = \`10\`

**SUM** is the ones digit and **CARRY** is the twos digit. Look closely at each column of the table: you've already built both.`,
    hints: [
      'Compare the SUM column, and then the CARRY column, with gates you already have.',
      'SUM is XOR, and CARRY is AND.',
    ],
    reference: (b) => {
      b.wire(xor(b, 'A', 'B'), 'SUM');
      b.wire(and(b, 'A', 'B'), 'CARRY');
    },
  },
  {
    id: '3.2',
    chapter: 3,
    title: 'Full Adder',
    summary: 'Add three bits A, B and CIN: SUM is the ones digit, COUT the twos digit.',
    inputs: ['A', 'B', 'CIN'],
    outputs: ['SUM', 'COUT'],
    goal: {
      kind: 'combinational',
      fn: ({ A = 0, B = 0, CIN = 0 }) => {
        const total = A + B + CIN;
        return { SUM: toBit(total & 1), COUT: toBit(total > 1) };
      },
    },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.fullAdder, name: 'Full Adder' },
    concept: `Adding longer numbers works like it did at school: column by column, carrying into the next column.

So each column must add **three** bits: A, B, and the carry coming in from the column to its right (**CIN**). The most it can reach is 1 + 1 + 1 = 3 = \`11\`, so two outputs are still enough: **SUM** and the carry out (**COUT**).

A circuit that does this is a **full adder**.`,
    hints: [
      'Add A and B first, then add CIN to that sum.',
      'Use two half adders in a row. COUT is ON if either of them carried.',
    ],
    reference: (b) => {
      const first = part(b, CHIP.halfAdder, { A: 'A', B: 'B' });
      const second = part(b, CHIP.halfAdder, { A: first.out('SUM'), B: 'CIN' });
      b.wire(second.out('SUM'), 'SUM');
      b.wire(or(b, first.out('CARRY'), second.out('CARRY')), 'COUT');
    },
  },
  {
    id: '3.3',
    chapter: 3,
    title: '4-bit Adder',
    summary: 'Add two 4-bit numbers A and B plus CIN. S is the 4-bit result and COUT the carry.',
    inputs: [...msbFirst('A'), ...msbFirst('B'), 'CIN'],
    outputs: [...msbFirst('S'), 'COUT'],
    goal: {
      kind: 'combinational',
      fn: (bits) => {
        const total = readBus(bits, 'A', 4) + readBus(bits, 'B', 4) + (bits.CIN ?? 0);
        return { ...writeBus('S', 4, total), COUT: toBit(total > 15) };
      },
      display: { formula: 'S + 16 × COUT = A + B + CIN' },
    },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.adder4, name: '4-bit Adder' },
    concept: `Four wires hold a number from 0 to 15. Bit 0 is worth 1 and bit 3 is worth 8. For example, \`0101\` + \`0011\` = \`1000\` (5 + 3 = 8).

A **ripple-carry adder** passes the carry from column to column, right to left.

If the total is more than 15, it doesn't fit in 4 bits: COUT turns ON. The table has 512 rows, and every one is tested.`,
    hints: [
      'Bit 0, the least significant, is the rightmost column. Start there.',
      "Chain four full adders, each column's COUT feeding the next column's CIN.",
    ],
    reference: (b) => {
      let carry: PinRef | string = 'CIN';
      for (const i of BITS) {
        const fa = part(b, CHIP.fullAdder, { A: `A${i}`, B: `B${i}`, CIN: carry });
        b.wire(fa.out('SUM'), `S${i}`);
        carry = fa.out('COUT');
      }
      b.wire(carry, 'COUT');
    },
  },
  {
    id: '3.4',
    chapter: 3,
    title: '4-bit Subtractor',
    summary: 'Output D = A − B as a 4-bit two’s complement number.',
    inputs: [...msbFirst('A'), ...msbFirst('B')],
    outputs: msbFirst('D'),
    goal: {
      kind: 'combinational',
      fn: (bits) => writeBus('D', 4, readBus(bits, 'A', 4) - readBus(bits, 'B', 4)),
      display: { formula: 'D = A − B (wrapping around within 4 bits)' },
    },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.sub4, name: '4-bit Subtractor' },
    concept: `Can you subtract without designing a new circuit? Yes, with **two's complement**.

To make −B, invert every bit of B and add 1. So A − B = A + (NOT B) + 1.

Results wrap around within 4 bits, like a car's odometer: 3 − 5 gives \`1110\`. Read as **two's complement**, where bit 3 is worth −8 instead of 8, that's −8 + 4 + 2 = −2. Correct! Whenever the true answer is between −8 and 7, D shows it exactly.

Your adder already has a spare input that can add the 1.`,
    hints: [
      'Follow the recipe A + (NOT B) + 1 using chips you already own.',
      'Invert each bit of B on its way into the adder, and connect CIN to Constant 1.',
    ],
    reference: (b) => {
      const one = part(b, 'const1').out('out');
      const inputs: Record<string, PinRef | string> = { CIN: one };
      for (const i of BITS) {
        inputs[`A${i}`] = `A${i}`;
        inputs[`B${i}`] = not(b, `B${i}`);
      }
      const adder = part(b, CHIP.adder4, inputs);
      for (const i of BITS) b.wire(adder.out(`S${i}`), `D${i}`);
    },
  },
];
