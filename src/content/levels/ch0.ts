/**
 * Chapter 0: Switches. Relays, power, and the discovery of NAND (spec §6).
 */
import { toBit } from '../../engine/model.ts';
import type { PinTarget } from '../../engine/validate.ts';
import { part } from '../recipes.ts';
import type { LevelDef } from '../types.ts';

/** In this chapter the input switches only control relay coils; current comes from Power. */
const coilsOnly: { inputsOnlyDrive: readonly PinTarget[] } = {
  inputsOnlyDrive: [
    { kind: 'relayNO', pin: 'coil' },
    { kind: 'relayNC', pin: 'coil' },
  ],
};

export const CH0: LevelDef[] = [
  {
    id: '0.1',
    chapter: 0,
    title: 'Relay',
    summary: 'Light the lamp OUT whenever switch A is ON.',
    inputs: ['A'],
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A }) => ({ OUT: toBit(A) }) },
    toolbox: { include: ['power', 'relayNO'] },
    constraints: coilsOnly,
    concept: `A **relay** is a switch flipped by electricity. Current through its **coil** makes a small magnet pull a metal contact closed. A *normally-open* relay connects its \`in\` pin to its \`out\` pin only while its coil is powered.

Switch **A** is a weak signal: it can only drive a relay's coil, not light a lamp. The current for the lamp comes from **Power**.

In 1937 George Stibitz built an adding machine from relays on his kitchen table. By the end of this game you'll have built much more.`,
    hints: [
      'The lamp needs current from Power, and A decides whether that current gets through.',
      "Power goes into the relay's `in` pin, and A goes to its `coil`.",
    ],
    reference: (b) => {
      const p = part(b, 'power');
      const r = part(b, 'relayNO', { coil: 'A', in: p.out('out') });
      b.wire(r.out('out'), 'OUT');
    },
  },
  {
    id: '0.2',
    chapter: 0,
    title: 'Series',
    summary: 'Light OUT only when A and B are both ON.',
    inputs: ['A', 'B'],
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A, B }) => ({ OUT: toBit(A && B) }) },
    toolbox: { include: ['power', 'relayNO'] },
    constraints: coilsOnly,
    concept: `Two switches one after another, **in series**, only let current through when *both* are closed, like two doors in a hallway that must both be open.

That rule has a name in logic: **AND**. The output is ON only when every input is ON.

Truth tables list every combination of inputs and the output you want for each one. Check the table on the right: only one row lights the lamp.`,
    hints: [
      'Current has to pass through two relays, one after the other.',
      "Feed the first relay's `out` into the second relay's `in`.",
    ],
    reference: (b) => {
      const p = part(b, 'power');
      const r1 = part(b, 'relayNO', { coil: 'A', in: p.out('out') });
      const r2 = part(b, 'relayNO', { coil: 'B', in: r1.out('out') });
      b.wire(r2.out('out'), 'OUT');
    },
  },
  {
    id: '0.3',
    chapter: 0,
    title: 'Inverter',
    summary: 'Light OUT when A is OFF, and turn it off when A is ON.',
    inputs: ['A'],
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A }) => ({ OUT: toBit(!A) }) },
    toolbox: { include: ['power', 'relayNO', 'relayNC'] },
    constraints: coilsOnly,
    concept: `A *normally-closed* relay works the other way round: its contact is connected while the coil is off, and powering the coil pulls it **open**.

Turning one thing ON turns another OFF. In logic this is **NOT**, also called an **inverter**: the output is always the opposite of the input.

It sounds trivial, but without NOT you can't build anything that reacts to a signal being *absent*.`,
    hints: [
      'Which kind of relay lets current through while its coil is OFF?',
      "Power goes into a normally-closed relay's `in`, and A to its coil.",
    ],
    reference: (b) => {
      const p = part(b, 'power');
      const r = part(b, 'relayNC', { coil: 'A', in: p.out('out') });
      b.wire(r.out('out'), 'OUT');
    },
  },
  {
    id: '0.4',
    chapter: 0,
    title: 'NAND',
    summary: 'Light OUT unless A and B are both ON.',
    inputs: ['A', 'B'],
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A, B }) => ({ OUT: toBit(!(A && B)) }) },
    toolbox: { include: ['power', 'relayNO', 'relayNC'] },
    constraints: coilsOnly,
    unlocks: { kind: 'nand', name: 'NAND' },
    concept: `Wire two relay outputs to the same pin and they're joined **in parallel**: the lamp lights if *any* path is connected. A dot marks the join.

This level's rule is NOT (A AND B), called **NAND**. It's special: NAND is **universal**. Every other logic circuit, from a single gate to an entire computer, can be built from NAND alone.

Solve this and NAND becomes your building block. From the next chapter on, relays retire and NAND is all you start with.`,
    hints: [
      'OUT is ON whenever at least one of A or B is OFF.',
      'Use two normally-closed relays, one per input, and join both outputs at OUT.',
    ],
    reference: (b) => {
      const p = part(b, 'power');
      const r1 = part(b, 'relayNC', { coil: 'A', in: p.out('out') });
      const r2 = part(b, 'relayNC', { coil: 'B', in: p.out('out') });
      b.wire(r1.out('out'), 'OUT');
      b.wire(r2.out('out'), 'OUT');
    },
  },
];
