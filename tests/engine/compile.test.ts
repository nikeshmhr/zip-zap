import { describe, expect, it } from 'vitest';
import { buildCircuit } from '../../src/engine/builder.ts';
import type { CircuitBuilder, LevelIo } from '../../src/engine/builder.ts';
import type { Netlist } from '../../src/engine/compile.ts';
import { compile } from '../../src/engine/compile.ts';
import { primitiveResolver } from '../../src/engine/primitives.ts';

const compileOk = (io: LevelIo, recipe: (b: CircuitBuilder) => void): Netlist => {
  const result = compile(buildCircuit(io, recipe, primitiveResolver), primitiveResolver);
  if (!result.ok) throw new Error(result.validation.issues.map((i) => i.message).join('; '));
  return result.netlist;
};

const indexOf = (n: Netlist, id: string) => n.components.findIndex((c) => c.id === id);

describe('compile', () => {
  it('excludes level IO from the simulated components and maps IO pins to nets', () => {
    const n = compileOk({ inputs: ['A', 'B'], outputs: ['OUT'] }, (b) => {
      const g = b.add('nand');
      b.wire('A', g.in('a'));
      b.wire('B', g.in('b'));
      b.wire(g.out('out'), 'OUT');
    });
    expect(n.components.map((c) => c.id)).toEqual(['c1']);
    const [gate] = n.components;
    expect([...gate!.inputNets]).toEqual([n.inputNets.get('A'), n.inputNets.get('B')]);
    expect([...gate!.outputNets]).toEqual([n.outputNets.get('OUT')]);
  });

  it('builds a fan-out net: one driver, each reading component listed once', () => {
    const n = compileOk({ inputs: ['A'], outputs: ['X', 'Y'] }, (b) => {
      const src = b.add('nand');
      const g1 = b.add('nand');
      const g2 = b.add('nand');
      b.wire('A', src.in('a'));
      b.wire('A', src.in('b'));
      b.wire(src.out('out'), g1.in('a'));
      b.wire(src.out('out'), g1.in('b'));
      b.wire(src.out('out'), g2.in('a'));
      b.wire(g1.out('out'), 'X');
      b.wire(g2.out('out'), 'Y');
    });
    const net = n.components[indexOf(n, 'c1')]!.outputNets[0]!;
    expect([...n.netDrivers[net]!]).toEqual([indexOf(n, 'c1'), 0]);
    expect([...n.netReaders[net]!].sort()).toEqual([indexOf(n, 'c2'), indexOf(n, 'c3')].sort());

    // The level input net has no simulated driver (it is external) and one reader.
    const a = n.inputNets.get('A')!;
    expect([...n.netDrivers[a]!]).toEqual([]);
    expect([...n.netReaders[a]!]).toEqual([indexOf(n, 'c1')]);
  });

  it('merges joined relay outputs into one net with two drivers', () => {
    const n = compileOk({ inputs: ['A', 'B'], outputs: ['OUT'] }, (b) => {
      const p = b.add('power');
      const r1 = b.add('relayNC');
      const r2 = b.add('relayNC');
      b.wire(p.out('out'), r1.in('in'));
      b.wire(p.out('out'), r2.in('in'));
      b.wire('A', r1.in('coil'));
      b.wire('B', r2.in('coil'));
      b.wire(r1.out('out'), 'OUT');
      b.wire(r2.out('out'), 'OUT');
    });
    const out = n.outputNets.get('OUT')!;
    expect([...n.netDrivers[out]!]).toEqual([indexOf(n, 'c2'), 0, indexOf(n, 'c3'), 0]);
    expect(n.components[indexOf(n, 'c2')]!.outputNets[0]).toBe(out);
    expect(n.components[indexOf(n, 'c3')]!.outputNets[0]).toBe(out);
  });

  it('gives unconnected pins their own driverless nets', () => {
    const n = compileOk({ inputs: [], outputs: ['OUT'] }, (b) => void b.add('nand'));
    const [a, bNet] = n.components[0]!.inputNets;
    expect(a).not.toBe(bNet);
    expect([...n.netDrivers[a!]!]).toEqual([]);
    expect([...n.netDrivers[n.outputNets.get('OUT')!]!]).toEqual([]);
  });

  it('refuses to compile invalid circuits and returns the validation', () => {
    const circuit = buildCircuit({ inputs: [], outputs: ['OUT'] }, (b) => {
      b.wire(b.add('nand').out('out'), 'OUT');
      b.wire(b.add('nand').out('out'), 'OUT');
    });
    const result = compile(circuit, primitiveResolver);
    expect(result.ok).toBe(false);
    expect(result.validation.issues.map((i) => i.code)).toEqual(['short']);
  });
});
