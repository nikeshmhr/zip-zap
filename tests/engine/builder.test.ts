import { describe, expect, it } from 'vitest';
import { buildCircuit, emptyCircuit } from '../../src/engine/builder.ts';
import type { Circuit } from '../../src/engine/model.ts';
import { primitiveResolver } from '../../src/engine/primitives.ts';

const io = { inputs: ['A', 'B'], outputs: ['OUT'] };

/** XOR from four NANDs. */
const xor = () =>
  buildCircuit(
    io,
    (b) => {
      const n1 = b.add('nand');
      const n2 = b.add('nand');
      const n3 = b.add('nand');
      const n4 = b.add('nand');
      b.wire('A', n1.in('a'));
      b.wire('B', n1.in('b'));
      b.wire('A', n2.in('a'));
      b.wire(n1.out('out'), n2.in('b'));
      b.wire(n1.out('out'), n3.in('a'));
      b.wire('B', n3.in('b'));
      b.wire(n2.out('out'), n4.in('a'));
      b.wire(n3.out('out'), n4.in('b'));
      b.wire(n4.out('out'), 'OUT');
    },
    primitiveResolver,
  );

const posOf = (c: Circuit, id: string) => c.components.find((x) => x.id === id)!.pos;

describe('buildCircuit', () => {
  it('creates IO components with stable ids and labels', () => {
    const c = xor();
    const io = c.components.filter((x) => x.kind === 'in' || x.kind === 'out');
    expect(io.map((x) => [x.id, x.kind, x.label])).toEqual([
      ['in:A', 'in', 'A'],
      ['in:B', 'in', 'B'],
      ['out:OUT', 'out', 'OUT'],
    ]);
  });

  it('resolves string endpoints to level pins', () => {
    const c = xor();
    expect(c.wires[0]).toEqual({
      id: 'w1',
      from: { comp: 'in:A', pin: 'out' },
      to: { comp: 'c1', pin: 'a' },
    });
    expect(c.wires.at(-1)?.to).toEqual({ comp: 'out:OUT', pin: 'in' });
  });

  it('lays out components without overlapping positions', () => {
    const c = xor();
    const keys = c.components.map((x) => `${x.pos.x},${x.pos.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('places columns by signal depth: inputs, then gates, then outputs', () => {
    const c = xor();
    expect(posOf(c, 'in:A').x).toBe(0);
    expect(posOf(c, 'c1').x).toBeLessThan(posOf(c, 'c2').x);
    expect(posOf(c, 'c2').x).toBe(posOf(c, 'c3').x);
    expect(posOf(c, 'c4').x).toBeGreaterThan(posOf(c, 'c2').x);
    expect(posOf(c, 'out:OUT').x).toBeGreaterThan(posOf(c, 'c4').x);
  });

  it('lays out circuits with feedback loops', () => {
    // Cross-coupled NANDs (SR latch, active-low inputs).
    const c = buildCircuit({ inputs: ['S', 'R'], outputs: ['Q'] }, (b) => {
      const top = b.add('nand');
      const bottom = b.add('nand');
      b.wire('S', top.in('a'));
      b.wire(bottom.out('out'), top.in('b'));
      b.wire('R', bottom.in('b'));
      b.wire(top.out('out'), bottom.in('a'));
      b.wire(top.out('out'), 'Q');
    });
    const keys = c.components.map((x) => `${x.pos.x},${x.pos.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('rejects unknown pins and level pin names', () => {
    expect(() => buildCircuit(io, (b) => b.add('nand').in('x'), primitiveResolver)).toThrow(
      /no input pin "x"/,
    );
    expect(() => buildCircuit(io, (b) => b.add('nand').out('a'), primitiveResolver)).toThrow(
      /no output pin "a"/,
    );
    expect(() => buildCircuit(io, (b) => b.wire('Z', 'OUT'))).toThrow(/not a level input/);
    expect(() => buildCircuit(io, (b) => b.wire('A', 'A'))).toThrow(/not a level output/);
    expect(() => buildCircuit(io, (b) => b.add('chip:nope'), primitiveResolver)).toThrow(
      /Unknown component/,
    );
  });
});

describe('emptyCircuit', () => {
  it('contains only IO, inputs left of outputs', () => {
    const c = emptyCircuit(io);
    expect(c.wires).toEqual([]);
    expect(c.components).toHaveLength(3);
    expect(posOf(c, 'in:A').x).toBeLessThan(posOf(c, 'out:OUT').x);
  });
});
