/**
 * A combinational level's goal as a truth table (spec §7.1). Large tables show their formula
 * and sample rows, always including any failing rows, with an option to show every row.
 * The row matching the current switch positions is highlighted; clicking a row sets the
 * switches to it.
 */
import { useState } from 'react';
import type { Bits } from '../../engine/model.ts';
import type { CaseResult } from '../../engine/testRunner.ts';
import type { Column } from './columns.ts';
import { groupColumns } from './columns.ts';
import styles from './TruthTable.module.css';

/** Rows shown before "Show all" for formula-style goals. */
export const SAMPLE_ROWS = 8;

export interface TruthTableProps {
  inputs: readonly string[];
  outputs: readonly string[];
  rows: readonly { inputs: Bits; expected: Bits }[];
  /** Set when the goal is too large to read row by row. */
  formula?: string;
  /** Results of the last test run, by row index. */
  results?: readonly CaseResult[];
  /** Current switch positions. */
  live?: Bits;
  onRowClick?(inputs: Bits): void;
}

/** "A" for a single pin; "A₃–₀" style for a grouped number, showing which bits it covers. */
function ColumnLabel({ column }: { column: Column }) {
  if (column.pins.length === 1) return column.label;
  const high = column.pins[0]!.slice(column.label.length);
  return (
    <>
      {column.label}
      <sub className={styles.range}>{high}–0</sub>
    </>
  );
}

const STATUS_LABEL = { pass: 'Pass', fail: 'Fail', unstable: 'Never settles' } as const;
const STATUS_ICON = { pass: '✓', fail: '✗', unstable: '∿' } as const;

export function TruthTable(props: TruthTableProps) {
  const { inputs, outputs, rows, formula, results, live, onRowClick } = props;
  const [showAll, setShowAll] = useState(false);
  const inputColumns = groupColumns(inputs);
  const outputColumns = groupColumns(outputs);
  const digits = (bits: Bits, pins: readonly string[]) => pins.map((p) => bits[p] ?? 0).join('');

  const isLive = (row: Bits) => !!live && inputs.every((name) => (live[name] ?? 0) === row[name]);
  const failing = new Set((results ?? []).filter((r) => r.status !== 'pass').map((r) => r.index));
  const visible = rows
    .map((row, index) => ({ ...row, index }))
    .filter(
      ({ index, inputs: bits }) =>
        !formula || showAll || index < SAMPLE_ROWS || failing.has(index) || isLive(bits),
    );

  return (
    <div className={styles.wrap}>
      {formula && <p className={styles.formula}>{formula}</p>}
      <table className={styles.table}>
        <thead>
          <tr>
            {inputColumns.map((col) => (
              <th key={col.label} scope="col" className={styles.input} title={col.pins.join(' ')}>
                <ColumnLabel column={col} />
              </th>
            ))}
            {outputColumns.map((col, i) => (
              <th
                key={col.label}
                scope="col"
                className={i === 0 ? `${styles.output} ${styles.divider}` : styles.output}
                title={col.pins.join(' ')}
              >
                <ColumnLabel column={col} />
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
          {visible.map(({ inputs: bits, expected, index }) => {
            const result = results?.[index];
            return (
              <tr
                key={index}
                data-row={index}
                data-status={result?.status}
                data-live={isLive(bits) || undefined}
                onClick={() => onRowClick?.(bits)}
                title={onRowClick ? 'Set the switches to this row' : undefined}
              >
                {inputColumns.map((col) => (
                  <td
                    key={col.label}
                    className={styles.input}
                    data-bit={col.pins.length === 1 ? bits[col.pins[0]!] : undefined}
                  >
                    {digits(bits, col.pins)}
                  </td>
                ))}
                {outputColumns.map((col, i) => {
                  const want = digits(expected, col.pins);
                  const got = result ? digits(result.actual, col.pins) : want;
                  const wrong = result?.status === 'fail' && got !== want;
                  return (
                    <td
                      key={col.label}
                      className={i === 0 ? `${styles.output} ${styles.divider}` : styles.output}
                      data-bit={col.pins.length === 1 ? expected[col.pins[0]!] : undefined}
                      data-wrong={wrong || undefined}
                      title={wrong ? `Expected ${want}, got ${got}` : undefined}
                    >
                      {want}
                      {wrong && <span className={styles.got}>got {got}</span>}
                    </td>
                  );
                })}
                {results && (
                  <td className={styles.status} aria-label={result && STATUS_LABEL[result.status]}>
                    {result && STATUS_ICON[result.status]}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {formula && rows.length > SAMPLE_ROWS && (
        <button type="button" className={styles.more} onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer rows' : `Show all ${rows.length} rows`}
        </button>
      )}
    </div>
  );
}
