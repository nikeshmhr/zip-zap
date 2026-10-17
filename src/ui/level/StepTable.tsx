/**
 * A memory level's goal as steps over time (spec §7.2): what each step changes and the
 * outputs expected after the circuit settles. Clock edges are marked ↑ and ↓; changed inputs are
 * highlighted; warm-up steps (which only check the circuit settles) show "—".
 */
import { useEffect, useRef } from 'react';
import type { Bits } from '../../engine/model.ts';
import type { CaseResult, PlannedStep } from '../../engine/testRunner.ts';
import type { Column } from './columns.ts';
import { groupColumns } from './columns.ts';
import styles from './TruthTable.module.css';

export interface StepRef {
  sequence: number;
  step: number;
}

export interface StepTableProps {
  inputs: readonly string[];
  outputs: readonly string[];
  plan: readonly (readonly PlannedStep[])[];
  clockPin?: string;
  /** Results of the last test run, in plan order. */
  results?: readonly CaseResult[];
  /** The step shown on the canvas. */
  selected?: StepRef;
  onSelect?(step: StepRef): void;
}

const STATUS_ICON = { pass: '✓', fail: '✗', unstable: '∿' } as const;
const STATUS_LABEL = { pass: 'Pass', fail: 'Fail', unstable: 'Never settles' } as const;

const digits = (bits: Bits, pins: readonly string[]) => pins.map((p) => bits[p] ?? 0).join('');

function Label({ column }: { column: Column }) {
  if (column.pins.length === 1) return column.label;
  const high = column.pins[0]!.slice(column.label.length);
  return (
    <>
      {column.label}
      <sub className={styles.range}>{high}–0</sub>
    </>
  );
}

export function StepTable(props: StepTableProps) {
  const { inputs, outputs, plan, clockPin, results, selected, onSelect } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  // Bring the shown step (e.g. the first failure after a run) into view.
  useEffect(() => {
    if (!selected) return;
    wrapRef.current
      ?.querySelector(
        `table:nth-of-type(${selected.sequence + 1}) tr[data-step="${selected.step}"]`,
      )
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const inputColumns = groupColumns(inputs);
  const outputColumns = groupColumns(outputs);
  const resultAt = new Map(results?.map((r) => [`${r.sequence}:${r.step}`, r]));

  /** The previous step's inputs (all OFF before the first step). */
  const previous = (steps: readonly PlannedStep[], i: number): Bits =>
    i > 0 ? steps[i - 1]!.inputs : Object.fromEntries(inputs.map((n) => [n, 0]));

  const inputCell = (steps: readonly PlannedStep[], i: number, col: Column) => {
    const step = steps[i]!;
    const before = previous(steps, i);
    // The first step sets every input; afterwards highlight only real changes.
    const changed =
      i === 0
        ? col.pins.some((p) => p in step.set)
        : col.pins.some((p) => step.inputs[p] !== before[p]);
    const isClock = !!clockPin && col.pins.length === 1 && col.pins[0] === clockPin;
    if (isClock && step.inputs[clockPin] !== before[clockPin]) {
      return { text: step.inputs[clockPin] ? '↑' : '↓', changed: true, edge: true };
    }
    return { text: digits(step.inputs, col.pins), changed, edge: false };
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      {plan.map((steps, sequence) => (
        <table key={sequence} className={styles.table} aria-label={`Sequence ${sequence + 1}`}>
          {plan.length > 1 && <caption className={styles.caption}>Sequence {sequence + 1}</caption>}
          <thead>
            <tr>
              <th scope="col" className={styles.stepNumber}>
                Step
              </th>
              {inputColumns.map((col) => (
                <th key={col.label} scope="col" className={styles.input} title={col.pins.join(' ')}>
                  <Label column={col} />
                </th>
              ))}
              {outputColumns.map((col, i) => (
                <th
                  key={col.label}
                  scope="col"
                  className={i === 0 ? `${styles.output} ${styles.divider}` : styles.output}
                  title={col.pins.join(' ')}
                >
                  <Label column={col} />
                </th>
              ))}
              {results && (
                <th scope="col" className={styles.status}>
                  <span className={styles.visuallyHidden}>Result</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {steps.map((step, i) => {
              const result = resultAt.get(`${sequence}:${step.step}`);
              const checked = Object.keys(step.expected).length > 0;
              const isSelected = selected?.sequence === sequence && selected.step === step.step;
              return (
                <tr
                  key={step.step}
                  data-step={step.step}
                  data-status={result?.status}
                  data-live={isSelected || undefined}
                  onClick={() => onSelect?.({ sequence, step: step.step })}
                  title={onSelect ? 'Show the circuit at this step' : undefined}
                >
                  <td className={styles.stepNumber}>{step.step + 1}</td>
                  {inputColumns.map((col) => {
                    const cell = inputCell(steps, i, col);
                    return (
                      <td
                        key={col.label}
                        className={styles.input}
                        data-changed={cell.changed || undefined}
                        data-edge={cell.edge || undefined}
                      >
                        {cell.text}
                      </td>
                    );
                  })}
                  {outputColumns.map((col, i) => {
                    const className =
                      i === 0 ? `${styles.output} ${styles.divider}` : styles.output;
                    if (!checked || col.pins.some((p) => !(p in step.expected))) {
                      return (
                        <td
                          key={col.label}
                          className={`${className} ${styles.unchecked}`}
                          title="Warm-up step: only checks that the circuit settles"
                        >
                          —
                        </td>
                      );
                    }
                    const want = digits(step.expected, col.pins);
                    const got = result ? digits(result.actual, col.pins) : want;
                    const wrong = result?.status === 'fail' && got !== want;
                    return (
                      <td
                        key={col.label}
                        className={className}
                        data-bit={col.pins.length === 1 ? step.expected[col.pins[0]!] : undefined}
                        data-wrong={wrong || undefined}
                        title={wrong ? `Expected ${want}, got ${got}` : undefined}
                      >
                        {want}
                        {wrong && <span className={styles.got}>got {got}</span>}
                      </td>
                    );
                  })}
                  {results && (
                    <td
                      className={styles.status}
                      aria-label={result && STATUS_LABEL[result.status]}
                    >
                      {result && STATUS_ICON[result.status]}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
}
