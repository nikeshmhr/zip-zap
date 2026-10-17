/**
 * A timing diagram for memory levels (T6.3): each pin as a signal over the steps. Outputs
 * show the expected signal (dashed once tests have run) and the actual one (solid), with
 * mismatched steps shaded. Multi-bit numbers are drawn as lanes labelled with their value.
 * Clicking a step shows the circuit at that step.
 */
import type { Bits } from '../../engine/model.ts';
import type { CaseResult, PlannedStep } from '../../engine/testRunner.ts';
import type { Column } from './columns.ts';
import { groupColumns } from './columns.ts';
import type { StepRef } from './StepTable.tsx';
import styles from './Waveform.module.css';

export interface WaveformProps {
  inputs: readonly string[];
  outputs: readonly string[];
  plan: readonly (readonly PlannedStep[])[];
  results?: readonly CaseResult[];
  selected?: StepRef;
  onSelect?(step: StepRef): void;
}

const LABEL = 56;
const STEP = 18;
const ROW = 24;
const PAD = 5;
const GAP = 12; // between sequences

const value = (bits: Bits, pins: readonly string[]) =>
  pins.reduce((n, p) => n * 2 + (bits[p] ?? 0), 0);

/** A single-bit signal as a square wave; undefined values break the line. */
function bitPath(values: readonly (number | undefined)[], x0: number, top: number): string {
  const y = (v: number) => (v ? top + PAD : top + ROW - PAD);
  let d = '';
  let last: number | undefined;
  values.forEach((v, i) => {
    const x = x0 + i * STEP;
    if (v === undefined) {
      last = undefined;
      return;
    }
    if (last === undefined) d += `M${x} ${y(v)}`;
    else if (last !== v) d += `L${x} ${y(last)}L${x} ${y(v)}`;
    d += `L${x + STEP} ${y(v)}`;
    last = v;
  });
  return d;
}

/** Lane segments for a multi-bit value: one per run of equal values. */
function busRuns(values: readonly (number | undefined)[]) {
  const runs: { start: number; end: number; value: number | undefined }[] = [];
  values.forEach((v, i) => {
    const run = runs.at(-1);
    if (run && run.value === v) run.end = i + 1;
    else runs.push({ start: i, end: i + 1, value: v });
  });
  return runs;
}

export function Waveform({ inputs, outputs, plan, results, selected, onSelect }: WaveformProps) {
  const rows: { column: Column; kind: 'in' | 'out' }[] = [
    ...groupColumns(inputs).map((column) => ({ column, kind: 'in' as const })),
    ...groupColumns(outputs).map((column) => ({ column, kind: 'out' as const })),
  ];
  const resultAt = new Map(results?.map((r) => [`${r.sequence}:${r.step}`, r]));
  const offsets: number[] = [];
  let x = LABEL;
  for (const steps of plan) {
    offsets.push(x);
    x += steps.length * STEP + GAP;
  }
  const width = x - GAP + 4;
  const height = rows.length * ROW + 18;

  return (
    <div className={styles.waveform}>
      {results && (
        <p className={styles.legend}>
          <span className={styles.keyExpected} /> expected <span className={styles.keyActual} />{' '}
          your circuit · red: a step that failed
        </p>
      )}
      <div className={styles.scroll}>
        <svg
          className={styles.wave}
          width={width}
          height={height}
          role="img"
          aria-label="Timing diagram of the level's pins over the test steps"
        >
          {rows.map(({ column }, r) => (
            <text key={column.label} className={styles.label} x={4} y={r * ROW + ROW / 2 + 4}>
              {column.label}
            </text>
          ))}
          {plan.map((steps, sequence) => {
            const x0 = offsets[sequence]!;
            return (
              <g key={sequence}>
                {steps.map((step, i) => {
                  const result = resultAt.get(`${sequence}:${step.step}`);
                  const isSelected = selected?.sequence === sequence && selected.step === step.step;
                  return (
                    <g key={step.step}>
                      {isSelected && (
                        <>
                          <rect
                            className={styles.selected}
                            x={x0 + i * STEP}
                            y={0}
                            width={STEP}
                            height={rows.length * ROW}
                          />
                          <text
                            className={styles.cursor}
                            x={x0 + i * STEP + STEP / 2}
                            y={height - 4}
                          >
                            {step.step + 1}
                          </text>
                        </>
                      )}
                      {result && result.status !== 'pass' && (
                        <rect
                          className={styles.bad}
                          x={x0 + i * STEP}
                          y={0}
                          width={STEP}
                          height={rows.length * ROW}
                        />
                      )}
                      <rect
                        className={styles.hit}
                        data-wave-step={`${sequence}:${step.step}`}
                        x={x0 + i * STEP}
                        y={0}
                        width={STEP}
                        height={height}
                        onClick={() => onSelect?.({ sequence, step: step.step })}
                      >
                        <title>{`Step ${step.step + 1}`}</title>
                      </rect>
                      {(step.step + 1) % 5 === 0 && !isSelected && (
                        <text className={styles.tick} x={x0 + i * STEP + STEP / 2} y={height - 4}>
                          {step.step + 1}
                        </text>
                      )}
                    </g>
                  );
                })}
                {rows.map(({ column, kind }, r) => {
                  const top = r * ROW;
                  const expected = steps.map((s) =>
                    kind === 'in'
                      ? value(s.inputs, column.pins)
                      : column.pins.every((p) => p in s.expected)
                        ? value(s.expected, column.pins)
                        : undefined,
                  );
                  const actual =
                    kind === 'out' && results
                      ? steps.map((s) => {
                          const res = resultAt.get(`${sequence}:${s.step}`);
                          return res ? value(res.actual, column.pins) : undefined;
                        })
                      : undefined;
                  if (column.pins.length === 1) {
                    return (
                      <g key={column.label}>
                        <path
                          className={
                            actual ? styles.expected : kind === 'in' ? styles.input : styles.output
                          }
                          d={bitPath(expected, x0, top)}
                        />
                        {actual && <path className={styles.actual} d={bitPath(actual, x0, top)} />}
                      </g>
                    );
                  }
                  return (
                    <g key={column.label}>
                      {busRuns(actual ?? expected).map((run) => {
                        const left = x0 + run.start * STEP;
                        const right = x0 + run.end * STEP;
                        const w = right - left;
                        return (
                          <g key={run.start}>
                            {run.value !== undefined && (
                              <path
                                className={kind === 'in' ? styles.busIn : styles.busOut}
                                d={`M${left + 2} ${top + ROW / 2}L${left + 5} ${top + PAD}L${right - 5} ${top + PAD}L${right - 2} ${top + ROW / 2}L${right - 5} ${top + ROW - PAD}L${left + 5} ${top + ROW - PAD}Z`}
                              />
                            )}
                            {run.value !== undefined && w >= STEP * 2 && (
                              <text
                                className={styles.busText}
                                x={(left + right) / 2}
                                y={top + ROW / 2 + 3}
                              >
                                {run.value.toString(2).padStart(column.pins.length, '0')}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
