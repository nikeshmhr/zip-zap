import { describe, expect, it } from 'vitest';
import { buildCircuit } from '../../src/engine/builder.ts';
import type { CircuitBuilder } from '../../src/engine/builder.ts';
import type { SeqModel } from '../../src/engine/chips.ts';
import type { Bit } from '../../src/engine/model.ts';
import { toBit } from '../../src/engine/model.ts';
import { primitiveResolver } from '../../src/engine/primitives.ts';
import type { TestSpec } from '../../src/engine/testRunner.ts';
import { runTests } from '../../src/engine/testRunner.ts';
import { and, nand, not, or, xor } from './helpers.ts';

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

describe('runTests: sequential', () => {
  /** Reference: while EN is on, Q follows D; otherwise Q holds. */
  const dLatchModel: SeqModel<Bit> = {
    init: () => 0,
    step: ({ D = 0, EN = 0 }, q) => {
      const next = EN ? D : q;
      return { outputs: { Q: next }, state: next };
    },
  };

  const dLatchSpec: TestSpec = {
    inputs: ['D', 'EN'],
    outputs: ['Q'],
    goal: {
      kind: 'sequential',
      model: dLatchModel,
      sequences: [
        [
          { set: { EN: 1, D: 0 } }, // forcing step
          { set: { D: 1 } }, // transparent: Q follows D
          { set: { EN: 0 } }, // hold 1
          { set: { D: 0 } }, // still hold 1
          { set: { EN: 1 } }, // transparent again: Q = 0
        ],
        [
          { set: { EN: 1, D: 1 } }, // a second sequence starts from reset
          { set: { EN: 0 } },
        ],
      ],
    },
  };

  /** Gated SR latch from NANDs. */
  const dLatch = (b: CircuitBuilder) => {
    const nS = nand(b, 'D', 'EN');
    const nR = nand(b, not(b, 'D'), 'EN');
    const q = b.add('nand');
    const qn = b.add('nand');
    b.wire(nS, q.in('a'));
    b.wire(qn.out('out'), q.in('b'));
    b.wire(nR, qn.in('a'));
    b.wire(q.out('out'), qn.in('b'));
    b.wire(q.out('out'), 'Q');
  };

  it('passes a correct D latch, numbering cases by sequence and step', () => {
    const report = run(dLatchSpec, dLatch);
    expect(report.passed).toBe(true);
    expect(report.cases.map((c) => [c.index, c.sequence, c.step])).toEqual([
      [0, 0, 0],
      [1, 0, 1],
      [2, 0, 2],
      [3, 0, 3],
      [4, 0, 4],
      [5, 1, 0],
      [6, 1, 1],
    ]);
    expect(report.cases[3]).toMatchObject({ inputs: { D: 0, EN: 0 }, expected: { Q: 1 } });
  });

  it('fails a "latch" missing its feedback at the first hold step', () => {
    const report = run(dLatchSpec, (b) => b.wire(and(b, 'D', 'EN'), 'Q'));
    expect(report.passed).toBe(false);
    const firstFail = report.cases.find((c) => c.status !== 'pass');
    expect(firstFail).toMatchObject({
      sequence: 0,
      step: 2,
      expected: { Q: 1 },
      actual: { Q: 0 },
      status: 'fail',
    });
  });

  it('checks only the listed outputs when a step has explicit expectations', () => {
    const spec: TestSpec = {
      inputs: ['D', 'EN'],
      outputs: ['Q', 'X'],
      goal: {
        kind: 'sequential',
        model: dLatchModel,
        sequences: [[{ set: { EN: 1, D: 1 }, expect: { Q: 1 } }]],
      },
    };
    const report = run(spec, dLatch); // X is never driven, but isn't checked
    expect(report.passed).toBe(true);
    expect(report.cases[0]!.expected).toEqual({ Q: 1 });
  });
});
