/** A tiny 3-level catalogue for testing the registry and the content harness. */
import { chipKind, toBit } from '../../src/engine/model.ts';
import type { ChapterDef, LevelDef } from '../../src/content/types.ts';

export const STUB_CHAPTERS: ChapterDef[] = [
  { id: 0, title: 'Switches', blurb: 'Relays.' },
  { id: 1, title: 'Gates', blurb: 'From NAND.' },
];

const common = {
  concept: 'A short concept card.',
  hints: ['A nudge.', 'A strong hint.'] as const,
};

export const STUB_LEVELS: LevelDef[] = [
  {
    ...common,
    id: '0.1',
    chapter: 0,
    title: 'NAND',
    summary: 'OUT is OFF only when A and B are both ON.',
    inputs: ['A', 'B'],
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A, B }) => ({ OUT: toBit(!(A && B)) }) },
    toolbox: { include: ['power', 'relayNC'] },
    unlocks: { kind: 'nand', name: 'NAND' },
    reference: (b) => {
      const p = b.add('power');
      const r1 = b.add('relayNC');
      const r2 = b.add('relayNC');
      b.wire(p.out('out'), r1.in('in'));
      b.wire(p.out('out'), r2.in('in'));
      b.wire('A', r1.in('coil'));
      b.wire('B', r2.in('coil'));
      b.wire(r1.out('out'), 'OUT');
      b.wire(r2.out('out'), 'OUT');
    },
  },
  {
    ...common,
    id: '1.1',
    chapter: 1,
    title: 'NOT',
    summary: 'OUT is the opposite of A.',
    inputs: ['A'],
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A }) => ({ OUT: toBit(!A) }) },
    toolbox: { include: 'unlocked' },
    unlocks: { kind: chipKind('not'), name: 'NOT' },
    reference: (b) => {
      const n = b.add('nand');
      b.wire('A', n.in('a'));
      b.wire('A', n.in('b'));
      b.wire(n.out('out'), 'OUT');
    },
  },
  {
    ...common,
    id: '1.2',
    chapter: 1,
    title: 'AND',
    summary: 'OUT is ON only when A and B are both ON.',
    inputs: ['A', 'B'],
    outputs: ['OUT'],
    goal: { kind: 'combinational', fn: ({ A, B }) => ({ OUT: toBit(A && B) }) },
    toolbox: { include: 'unlocked', exclude: ['const0'] },
    reference: (b) => {
      const n = b.add('nand');
      const inv = b.add(chipKind('not'));
      b.wire('A', n.in('a'));
      b.wire('B', n.in('b'));
      b.wire(n.out('out'), inv.in('A'));
      b.wire(inv.out('OUT'), 'OUT');
    },
  },
];
