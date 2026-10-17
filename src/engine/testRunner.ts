/**
 * Runs a level's tests against a player's circuit (plan §4.5, spec §7).
 */
import type { CombFn, SeqModel } from './chips.ts';
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

/** One step of a sequential test: change some inputs, let the circuit settle, check outputs. */
export interface Step {
  /** Inputs to change; others keep their previous value (all start OFF). */
  set: Partial<Bits>;
  /**
   * Explicit expected outputs. Omit to use the reference model's outputs. `{}` makes a warm-up
   * step that only checks the circuit is stable, e.g. clocking a known value into a flip-flop
   * whose power-on state is arbitrary.
   */
  expect?: Partial<Bits>;
}

export interface SequentialGoal {
  kind: 'sequential';
  /** Reference model: produces expected outputs, evaluated once per step with every input. */
  model: SeqModel;
  /**
   * Each sequence runs from a power-on reset. Sequences start with forcing (and if needed
   * warm-up) steps that put the circuit in a known state, and data inputs never change in the
   * same step as a rising clock edge (spec §15.7).
   */
  sequences: readonly (readonly Step[])[];
}

export type Goal = CombinationalGoal | SequentialGoal;

export interface TestSpec {
  /** Level input pins, in truth-table column order. */
  inputs: readonly string[];
  outputs: readonly string[];
  goal: Goal;
}

export type CaseStatus = 'pass' | 'fail' | 'unstable';

export interface CaseResult {
  /** Position in the whole report. */
  index: number;
  /** Sequential levels: which sequence and step this case is. */
  sequence?: number;
  step?: number;
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
  const cases =
    spec.goal.kind === 'combinational'
      ? runCombinational(sim, spec, spec.goal)
      : runSequential(sim, spec, spec.goal);
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

function runSequential(sim: Simulator, spec: TestSpec, goal: SequentialGoal): CaseResult[] {
  const cases: CaseResult[] = [];
  goal.sequences.forEach((steps, sequence) => {
    sim.reset();
    let state = goal.model.init();
    const inputs: Bits = Object.fromEntries(spec.inputs.map((name) => [name, 0]));

    steps.forEach((step, stepIndex) => {
      for (const [name, value] of Object.entries(step.set)) {
        if (value !== undefined) inputs[name] = value;
      }
      sim.setInputs(step.set);
      const { stable } = sim.settle();

      const result = goal.model.step({ ...inputs }, state);
      state = result.state;
      const expected: Bits = {};
      if (step.expect) {
        for (const [name, value] of Object.entries(step.expect)) {
          if (value !== undefined) expected[name] = value;
        }
      } else {
        for (const name of spec.outputs) expected[name] = toBit(result.outputs[name]);
      }

      const actual = sim.readOutputs();
      cases.push({
        index: cases.length,
        sequence,
        step: stepIndex,
        inputs: { ...inputs },
        expected,
        actual,
        status: judge(stable, expected, actual),
      });
    });
  });
  return cases;
}

function judge(stable: boolean, expected: Bits, actual: Bits): CaseStatus {
  if (!stable) return 'unstable';
  return Object.entries(expected).every(([name, value]) => actual[name] === value)
    ? 'pass'
    : 'fail';
}
