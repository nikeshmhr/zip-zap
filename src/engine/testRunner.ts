/**
 * Runs a level's tests against a player's circuit (plan §4.5, spec §7).
 */
import type { CombFn } from './chips.ts';
import { compile } from './compile.ts';
import type { Bits, Circuit } from './model.ts';
import { enumerateRows, toBit } from './model.ts';
import type { ComponentResolver } from './primitives.ts';
import { Simulator } from './simulate.ts';
import type { Issue, ValidateOptions } from './validate.ts';

export interface CombinationalGoal {
  kind: 'combinational';
  fn: CombFn;
  /** How the UI presents the goal; large levels show a formula plus sample rows. */
  display?: 'table' | { formula: string };
}

export type Goal = CombinationalGoal;

export interface TestSpec {
  /** Level input pins, in truth-table column order. */
  inputs: readonly string[];
  outputs: readonly string[];
  goal: Goal;
}

export type CaseStatus = 'pass' | 'fail' | 'unstable';

export interface CaseResult {
  index: number;
  /** Every level input's value for this case. */
  inputs: Bits;
  /** Expected values of the outputs that are checked. */
  expected: Bits;
  /** Actual values of every level output. */
  actual: Bits;
  status: CaseStatus;
}

export interface TestReport {
  passed: boolean;
  /** Set when the circuit can't be tested at all. */
  error?: 'short' | 'invalid';
  issues: Issue[];
  cases: CaseResult[];
}

export function runTests(
  circuit: Circuit,
  resolve: ComponentResolver,
  spec: TestSpec,
  options?: ValidateOptions,
): TestReport {
  const compiled = compile(circuit, resolve, options);
  if (!compiled.ok) {
    const { issues } = compiled.validation;
    const error = issues.every((i) => i.severity === 'short') ? 'short' : 'invalid';
    return { passed: false, error, issues, cases: [] };
  }

  const sim = new Simulator(compiled.netlist);
  const cases = runCombinational(sim, spec, spec.goal);
  return { passed: cases.every((c) => c.status === 'pass'), issues: [], cases };
}

function runCombinational(sim: Simulator, spec: TestSpec, goal: CombinationalGoal): CaseResult[] {
  return enumerateRows(spec.inputs).map((inputs, index) => {
    sim.reset();
    sim.setInputs(inputs);
    const { stable } = sim.settle();
    const result = goal.fn(inputs);
    const expected: Bits = {};
    for (const name of spec.outputs) expected[name] = toBit(result[name]);
    const actual = sim.readOutputs();
    return { index, inputs, expected, actual, status: judge(stable, expected, actual) };
  });
}

function judge(stable: boolean, expected: Bits, actual: Bits): CaseStatus {
  if (!stable) return 'unstable';
  return Object.entries(expected).every(([name, value]) => actual[name] === value)
    ? 'pass'
    : 'fail';
}
