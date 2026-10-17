import { describe, expect, it } from 'vitest';
import type { Circuit } from '../../src/engine/model.ts';
import {
  addComponent,
  deleteItems,
  duplicateComponents,
  isEditable,
  moveComponents,
  nextId,
  rotateComponents,
  startCircuit,
  STAGE_WIDTH,
} from '../../src/state/editing.ts';

const io = { inputs: ['A', 'B'], outputs: ['OUT'] };

/** Start circuit plus one NAND wired A→a, B→b, out→OUT. */
function nandCircuit(): Circuit {
  const { circuit, id } = addComponent(startCircuit(io), 'nand', { x: 10, y: 0 });
  return {
    ...circuit,
    wires: [
      { id: 'w1', from: { comp: 'in:A', pin: 'out' }, to: { comp: id, pin: 'a' } },
      { id: 'w2', from: { comp: 'in:B', pin: 'out' }, to: { comp: id, pin: 'b' } },
      { id: 'w3', from: { comp: id, pin: 'out' }, to: { comp: 'out:OUT', pin: 'in' } },
    ],
  };
}

const pos = (c: Circuit, id: string) => c.components.find((x) => x.id === id)?.pos;

describe('startCircuit', () => {
  it('puts inputs on the left and outputs on the right, centred on each other', () => {
    const c = startCircuit(io);
    expect(pos(c, 'in:A')).toEqual({ x: 0, y: 0 });
    expect(pos(c, 'in:B')).toEqual({ x: 0, y: 4 });
    expect(pos(c, 'out:OUT')).toEqual({ x: STAGE_WIDTH, y: 2 });
    expect(c.wires).toEqual([]);
  });
});

describe('nextId', () => {
  it('continues after the highest numbered id', () => {
    expect(nextId(['p1', 'p7', 'in:A', 'px'], 'p')).toBe('p8');
    expect(nextId([], 'w')).toBe('w1');
  });
});

describe('editing operations', () => {
  it('adds parts at whole grid positions with fresh ids', () => {
    const first = addComponent(startCircuit(io), 'nand', { x: 3.4, y: 5.6 });
    const second = addComponent(first.circuit, 'nand', { x: 0, y: 0 });
    expect(first.id).toBe('p1');
    expect(second.id).toBe('p2');
    expect(pos(first.circuit, 'p1')).toEqual({ x: 3, y: 6 });
  });

  it('moves parts but never level IO', () => {
    const c = moveComponents(nandCircuit(), ['p1', 'in:A'], { x: 2, y: -1 });
    expect(pos(c, 'p1')).toEqual({ x: 12, y: -1 });
    expect(pos(c, 'in:A')).toEqual({ x: 0, y: 0 });
  });

  it('returns the same circuit when nothing changes', () => {
    const c = nandCircuit();
    expect(moveComponents(c, ['p1'], { x: 0.2, y: 0 })).toBe(c);
    expect(rotateComponents(c, ['in:A'])).toBe(c);
    expect(deleteItems(c, ['in:A'], [])).toBe(c);
  });

  it('rotates parts a quarter turn at a time', () => {
    let c = nandCircuit();
    for (const expected of [90, 180, 270, 0]) {
      c = rotateComponents(c, ['p1']);
      expect(c.components.find((x) => x.id === 'p1')?.rot).toBe(expected);
    }
  });

  it('deletes parts together with their wires, and wires on their own', () => {
    const c = deleteItems(nandCircuit(), ['p1', 'in:A'], []);
    expect(c.components.map((x) => x.id)).toEqual(['in:A', 'in:B', 'out:OUT']);
    expect(c.wires).toEqual([]);
    expect(deleteItems(nandCircuit(), [], ['w2']).wires.map((w) => w.id)).toEqual(['w1', 'w3']);
  });

  it('duplicates parts and the wires between them, not wires to the outside', () => {
    let c = nandCircuit();
    const second = addComponent(c, 'nand', { x: 20, y: 0 });
    c = {
      ...second.circuit,
      wires: [
        ...second.circuit.wires,
        { id: 'w4', from: { comp: 'p1', pin: 'out' }, to: { comp: 'p2', pin: 'a' } },
      ],
    };
    const dup = duplicateComponents(c, ['p1', 'p2', 'in:A']);
    expect(dup.ids).toEqual(['p3', 'p4']);
    expect(pos(dup.circuit, 'p3')).toEqual({ x: 12, y: 2 });
    const newWires = dup.circuit.wires.slice(c.wires.length);
    expect(newWires).toEqual([
      { id: 'w5', from: { comp: 'p3', pin: 'out' }, to: { comp: 'p4', pin: 'a' } },
    ]);
  });

  it('knows which components are editable', () => {
    const c = nandCircuit();
    expect(isEditable(c, 'p1')).toBe(true);
    expect(isEditable(c, 'in:A')).toBe(false);
    expect(isEditable(c, 'ghost')).toBe(false);
  });
});
