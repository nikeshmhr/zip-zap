import { describe, expect, it } from 'vitest';
import { catalogue } from '../../src/content/index.ts';
import { runTests } from '../../src/engine/testRunner.ts';

/** Spec AC 9 allows 1 s; CI asserts a quarter of that for headroom (plan §9). */
const BUDGET_MS = 250;

const timeSuite = (id: string) => {
  const circuit = catalogue.referenceCircuit(id);
  const spec = catalogue.testSpec(id);
  const run = () => runTests(circuit, catalogue.resolve, spec, catalogue.validateOptions(id));
  run(); // warm up the JIT
  const start = performance.now();
  const report = run();
  return { report, ms: performance.now() - start };
};

describe('performance', () => {
  it(`runs the full Tiny RAM suite in under ${BUDGET_MS} ms`, () => {
    const { report, ms } = timeSuite('4.6');
    expect(report.passed).toBe(true);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it(`runs the 512-row 4-bit adder suite in under ${BUDGET_MS} ms`, () => {
    const { report, ms } = timeSuite('3.3');
    expect(report.cases).toHaveLength(512);
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
