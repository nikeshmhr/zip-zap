/**
 * Chapter 1: Gates. Every basic logic gate, built from NAND (spec §6).
 */
import { toBit } from '../../engine/model.ts';
import { CHIP, nand, not, or, xor } from '../recipes.ts';
import type { LevelDef } from '../types.ts';

const AB = ['A', 'B'] as const;

export const CH1: LevelDef[] = [
  {
    id: '1.1',
    chapter: 1,
    title: 'NOT',
    summary: 'Make OUT the opposite of A, using only NAND.',
    inputs: ['A'],
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A }) => ({ OUT: toBit(!A) }) },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.not, name: 'NOT' },
    concept: `Relays are gone. From here on you build with **NAND** gates: two inputs, one output, OFF only when both inputs are ON.

Every level you solve becomes a **chip**: a box with the level's pins that you can drop into later circuits. Build NOT now and you'll never need to build it again.

**Constant 0** and **Constant 1** sources are also in your toolbox from now on.`,
    hints: [
      'What does a NAND do when both of its inputs are the same?',
      'Wire A into both inputs of a single NAND.',
    ],
    reference: (b) => b.wire(nand(b, 'A', 'A'), 'OUT'),
  },
  {
    id: '1.2',
    chapter: 1,
    title: 'AND',
    summary: 'OUT is ON only when A and B are both ON.',
    inputs: AB,
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A, B }) => ({ OUT: toBit(A && B) }) },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.and, name: 'AND' },
    concept: `NAND means "NOT AND". So AND is... NOT NAND.

Your NOT chip is in the toolbox. Using chips you've built is the whole idea: each one hides the details you already understand, so you can think about the bigger picture.

Each chip shows its pin names, which match the level that created it.`,
    hints: [
      "NAND is almost AND; it's just upside down.",
      'Feed the output of a NAND into your NOT chip.',
    ],
    reference: (b) => b.wire(not(b, nand(b, 'A', 'B')), 'OUT'),
  },
  {
    id: '1.3',
    chapter: 1,
    title: 'OR',
    summary: 'OUT is ON when A, B, or both are ON.',
    inputs: AB,
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A, B }) => ({ OUT: toBit(A || B) }) },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.or, name: 'OR' },
    concept: `**OR** is ON when at least one input is ON.

In the 1800s the mathematician Augustus De Morgan noticed that "A or B" means the same as "not (not A and not B)". If it isn't true that both are false, at least one must be true.

**De Morgan's laws** let you swap AND for OR by inverting inputs and outputs. Engineers use them all the time to rebuild one gate out of another.`,
    hints: [
      'OR is OFF only when both inputs are OFF. NAND is OFF only when both are ON. What if NAND saw the opposite of A and B?',
      'Invert both inputs, then NAND them together.',
    ],
    reference: (b) => b.wire(nand(b, not(b, 'A'), not(b, 'B')), 'OUT'),
  },
  {
    id: '1.4',
    chapter: 1,
    title: 'NOR',
    summary: 'OUT is ON only when A and B are both OFF.',
    inputs: AB,
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A, B }) => ({ OUT: toBit(!(A || B)) }) },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.nor, name: 'NOR' },
    concept: `**NOR** is OR, inverted: ON only when every input is OFF.

Like NAND, NOR is universal. The Apollo Guidance Computer that flew to the Moon was built almost entirely from NOR gates, about 5,600 of them, because using a single kind of chip made it easier to manufacture reliably.

You'll use NOR again when you build memory.`,
    hints: ['You already have a chip that does the opposite.', 'OR, then NOT.'],
    reference: (b) => b.wire(not(b, or(b, 'A', 'B')), 'OUT'),
  },
  {
    id: '1.5',
    chapter: 1,
    title: 'XOR',
    summary: 'OUT is ON when exactly one of A and B is ON.',
    inputs: AB,
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A, B }) => ({ OUT: toBit(A !== B) }) },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.xor, name: 'XOR' },
    concept: `**XOR** ("exclusive or") is ON when the inputs *differ*: one or the other, but not both.

XOR is the heart of binary addition (you'll see why in Chapter 3), and it's used in encryption and error-checking too.

Any working circuit solves the level. For a challenge, the classic design uses just **four NANDs**. Check your NAND count when you solve it.`,
    hints: [
      'XOR is the same as (A OR B) AND NOT (A AND B).',
      'For the 4-NAND version, start with NAND(A, B) and use that one result twice.',
    ],
    reference: (b) => {
      const ab = nand(b, 'A', 'B');
      b.wire(nand(b, nand(b, 'A', ab), nand(b, ab, 'B')), 'OUT');
    },
  },
  {
    id: '1.6',
    chapter: 1,
    title: 'XNOR',
    summary: 'OUT is ON when A and B are equal.',
    inputs: AB,
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A, B }) => ({ OUT: toBit(A === B) }) },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: CHIP.xnor, name: 'XNOR' },
    concept: `**XNOR** is ON when both inputs are the same. It's an **equality detector** for a single bit.

To check whether two whole numbers are equal, a computer compares them bit by bit with XNOR and then checks that every result is ON.

That's every basic gate. Next you'll start using them to *route* signals.`,
    hints: ['XNOR is the opposite of a gate you just built.', 'XOR, then NOT.'],
    reference: (b) => b.wire(not(b, xor(b, 'A', 'B')), 'OUT'),
  },
];
