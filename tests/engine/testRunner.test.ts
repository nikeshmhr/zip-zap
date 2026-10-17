import { describe, expect, it } from 'vitest';
import { buildCircuit } from '../../src/engine/builder.ts';
import type { CircuitBuilder } from '../../src/engine/builder.ts';
import { toBit } from '../../src/engine/model.ts';
import { primitiveResolver } from '../../src/engine/primitives.ts';
import type { TestSpec } from '../../src/engine/testRunner.ts';
import { runTests } from '../../src/engine/testRunner.ts';
import { nand, or, xor } from './helpers.ts';

const xorSpec: TestSpec = {
  inputs: ['A', 'B'],
  outputs: ['OUT'],
  goal: { kind: 'combinational', fn: ({ A, B }) => ({ OUT: toBit(A !== B) }) },
};

const run = (spec: TestSpec, recipe: (b: CircuitBuilder) => void) =>
  runTests(buildCircuit(spec, recipe), primitiveResolver, spec);

describe('runTests: combinational', () => {
  it('passes a correct XOR on every row', () => {
    const report = run(xorSpec, (b) => b.wire(xor(b, 'A', 'B'), 'OUT'));
    expect(report.passed).toBe(true);
    expect(report.error).toBeUndefined();
    expect(report.cases.map((c) => c.status)).toEqual(['pass', 'pass', 'pass', 'pass']);
  });

  it('reports exactly the failing rows, with expected and actual values', () => {
    const report = run(xorSpec, (b) => b.wire(or(b, 'A', 'B'), 'OUT'));
    expect(report.passed).toBe(false);
    const failing = report.cases.filter((c) => c.status === 'fail');
    expect(failing).toEqual([
      {
        index: 3,
        inputs: { A: 1, B: 1 },
        expected: { OUT: 0 },
        actual: { OUT: 1 },
        status: 'fail',
      },
    ]);
  });

  it('fails the empty circuit', () => {
    const report = run(xorSpec, () => {});
    expect(report.passed).toBe(false);
    expect(report.cases.filter((c) => c.status === 'fail').map((c) => c.index)).toEqual([1, 2]);
  });

  it('treats missing outputs from the goal function as 0', () => {
    const spec: TestSpec = { ...xorSpec, goal: { kind: 'combinational', fn: () => ({}) } };
    expect(run(spec, () => {}).passed).toBe(true);
  });

  it('marks oscillating cases as unstable', () => {
    const report = run(xorSpec, (b) => {
      const g = b.add('nand');
      b.wire(g.out('out'), g.in('a'));
      b.wire('A', g.in('b'));
      b.wire(g.out('out'), 'OUT');
    });
    expect(report.passed).toBe(false);
    // With A=0 the gate outputs 1 (right for row 01, wrong for 00);
    // with A=1 it is an inverter looped onto itself.
    expect(report.cases.map((c) => c.status)).toEqual(['fail', 'pass', 'unstable', 'unstable']);
  });

  it('refuses shorted circuits without running any cases', () => {
    const report = run(xorSpec, (b) => {
      b.wire(nand(b, 'A', 'B'), 'OUT');
      b.wire(xor(b, 'A', 'B'), 'OUT');
    });
    expect(report).toMatchObject({ passed: false, error: 'short', cases: [] });
    expect(report.issues.map((i) => i.code)).toEqual(['short']);
  });

  it('refuses invalid circuits, honouring validation options', () => {
    const circuit = buildCircuit(xorSpec, (b) => b.wire(xor(b, 'A', 'B'), 'OUT'));
    const report = runTests(circuit, primitiveResolver, xorSpec, {
      allowedKinds: new Set(['relayNO']),
    });
    expect(report.error).toBe('invalid');
    expect(report.cases).toEqual([]);
  });
});
