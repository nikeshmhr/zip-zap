/**
 * The level's goal: summary, the truth table (or, for memory levels, the steps) and test runs.
 */
import { useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { catalogue } from '../../content/index.ts';
import type { LevelDef } from '../../content/types.ts';
import type { Bits, Circuit } from '../../engine/model.ts';
import { enumerateRows, toBit } from '../../engine/model.ts';
import type { TestReport } from '../../engine/testRunner.ts';
import { planSequences, runTests } from '../../engine/testRunner.ts';
import type { EditorStore } from '../../state/editorStore.ts';
import { Hints } from './Hints.tsx';
import type { StepRef } from './StepTable.tsx';
import { StepTable } from './StepTable.tsx';
import { Waveform } from './Waveform.tsx';
import { TruthTable } from './TruthTable.tsx';
import styles from './GoalPanel.module.css';

export interface GoalPanelProps {
  level: LevelDef;
  store: EditorStore;
  /** Called after a run in which every test passed. */
  onSolved?(report: TestReport, circuit: Circuit): void;
}

export function GoalPanel({ level, store, onSolved }: GoalPanelProps) {
  const live = useStore(store, (s) => s.inputs);
  const circuit = useStore(store, (s) => s.circuit);
  const { goal } = level;
  const [run, setRun] = useState<{ report: TestReport; circuit: Circuit } | null>(null);
  const stale = !!run && run.circuit !== circuit;

  const runAll = () => {
    const report = runTests(
      circuit,
      catalogue.resolve,
      catalogue.testSpec(level.id),
      catalogue.validateOptions(level.id),
    );
    setRun({ report, circuit });
    if (report.passed) onSolved?.(report, circuit);
    // Memory levels: jump to the first step that went wrong.
    const failure = report.cases.find((c) => c.status !== 'pass');
    if (
      goal.kind === 'sequential' &&
      failure?.sequence !== undefined &&
      failure.step !== undefined
    ) {
      showStep({ sequence: failure.sequence, step: failure.step });
    }
  };

  const rows = useMemo(() => {
    if (goal.kind !== 'combinational') return [];
    return enumerateRows(level.inputs).map((inputs) => {
      const result = goal.fn(inputs);
      const expected: Bits = {};
      for (const name of level.outputs) expected[name] = toBit(result[name]);
      return { inputs, expected };
    });
  }, [goal, level.inputs, level.outputs]);

  const plan = useMemo(
    () => (goal.kind === 'sequential' ? planSequences(level, goal) : []),
    [goal, level],
  );

  // The step shown on the canvas, valid while the switches and circuit are as it left them.
  const [view, setView] = useState<'steps' | 'timing'>('steps');
  const [shown, setShown] = useState<{ ref: StepRef; inputs: Bits; circuit: Circuit } | null>(null);
  const shownStep =
    shown && shown.inputs === live && shown.circuit === circuit ? shown.ref : undefined;

  const showStep = (ref: StepRef) => {
    const steps = plan[ref.sequence]?.slice(0, ref.step + 1).map((s) => s.inputs) ?? [];
    store.getState().replaySteps(steps);
    setShown({ ref, inputs: store.getState().inputs, circuit: store.getState().circuit });
  };

  const setSwitches = (bits: Bits) => {
    const s = store.getState();
    for (const name of level.inputs) s.setInput(name, bits[name] ?? 0);
  };

  return (
    <>
      <section className={styles.section} aria-label="Goal">
        <h2 className={styles.heading}>Goal</h2>
        <p className={styles.summary}>{level.summary}</p>
      </section>
      <section
        className={styles.section}
        aria-label={goal.kind === 'combinational' ? 'Truth table' : 'Steps'}
      >
        {goal.kind === 'combinational' ? (
          <TruthTable
            inputs={level.inputs}
            outputs={level.outputs}
            rows={rows}
            formula={typeof goal.display === 'object' ? goal.display.formula : undefined}
            results={run && !stale ? run.report.cases : undefined}
            live={live}
            onRowClick={setSwitches}
          />
        ) : (
          <>
            <div className={styles.tabs} role="tablist" aria-label="Goal view">
              {(['steps', 'timing'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  className={styles.tab}
                  onClick={() => setView(v)}
                >
                  {v === 'steps' ? 'Steps' : 'Timing'}
                </button>
              ))}
            </div>
            {view === 'steps' ? (
              <StepTable
                inputs={level.inputs}
                outputs={level.outputs}
                plan={plan}
                clockPin={level.clock?.pin}
                results={run && !stale ? run.report.cases : undefined}
                selected={shownStep}
                onSelect={showStep}
              />
            ) : (
              <Waveform
                inputs={level.inputs}
                outputs={level.outputs}
                plan={plan}
                results={run && !stale ? run.report.cases : undefined}
                selected={shownStep}
                onSelect={showStep}
              />
            )}
          </>
        )}
      </section>
      <section className={styles.section} aria-label="Tests">
        <button type="button" className={styles.run} onClick={runAll}>
          Run tests
        </button>
        {run && (
          <RunSummary report={run.report} stale={stale} sequential={goal.kind === 'sequential'} />
        )}
      </section>
      <Hints level={level} />
    </>
  );
}

function RunSummary({
  report,
  stale,
  sequential,
}: {
  report: TestReport;
  stale: boolean;
  sequential: boolean;
}) {
  if (report.error) {
    return (
      <div className={styles.result} data-state="blocked" role="status">
        <strong>
          {report.error === 'short'
            ? "Can't run the tests: there's a short circuit."
            : "Can't run the tests: the circuit has a problem."}
        </strong>
        <ul>
          {report.issues.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
        <span>The wires involved are shown in red.</span>
      </div>
    );
  }
  const total = report.cases.length;
  const passing = report.cases.filter((c) => c.status === 'pass').length;
  const firstFailure = report.cases.find((c) => c.status !== 'pass');
  return (
    <div
      className={styles.result}
      data-state={stale ? 'stale' : report.passed ? 'pass' : 'fail'}
      role="status"
    >
      <strong>
        {report.passed
          ? `All ${total} ${sequential ? 'steps' : 'cases'} pass.`
          : `${passing} of ${total} ${sequential ? 'steps' : 'cases'} pass.`}
      </strong>
      <div className={styles.meter} aria-hidden="true">
        <div style={{ width: `${(passing / total) * 100}%` }} />
      </div>
      {stale && <span>The circuit has changed since this run.</span>}
      {!stale && !report.passed && !sequential && (
        <span>Failing rows are marked in the table. Click one to try it on the canvas.</span>
      )}
      {!stale && sequential && firstFailure && (
        <span>
          First problem: sequence {(firstFailure.sequence ?? 0) + 1}, step{' '}
          {(firstFailure.step ?? 0) + 1}.{' '}
          {firstFailure.status === 'unstable'
            ? 'The circuit never settles.'
            : `Expected ${formatBits(firstFailure.expected)}, got ${formatBits(firstFailure.actual)}.`}
        </span>
      )}
    </div>
  );
}

const formatBits = (bits: Bits) =>
  Object.entries(bits)
    .map(([name, value]) => `${name}=${value}`)
    .join(', ');
