/**
 * The level's goal: summary, the truth table (or, for memory levels, the steps) and test runs.
 */
import { useMemo } from 'react';
import { useStore } from 'zustand';
import type { LevelDef } from '../../content/types.ts';
import type { Bits } from '../../engine/model.ts';
import { enumerateRows, toBit } from '../../engine/model.ts';
import type { EditorStore } from '../../state/editorStore.ts';
import { TruthTable } from './TruthTable.tsx';
import styles from './GoalPanel.module.css';

export function GoalPanel({ level, store }: { level: LevelDef; store: EditorStore }) {
  const live = useStore(store, (s) => s.inputs);
  const { goal } = level;

  const rows = useMemo(() => {
    if (goal.kind !== 'combinational') return [];
    return enumerateRows(level.inputs).map((inputs) => {
      const result = goal.fn(inputs);
      const expected: Bits = {};
      for (const name of level.outputs) expected[name] = toBit(result[name]);
      return { inputs, expected };
    });
  }, [goal, level.inputs, level.outputs]);

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
      <section className={styles.section} aria-label="Truth table">
        {goal.kind === 'combinational' ? (
          <TruthTable
            inputs={level.inputs}
            outputs={level.outputs}
            rows={rows}
            formula={typeof goal.display === 'object' ? goal.display.formula : undefined}
            live={live}
            onRowClick={setSwitches}
          />
        ) : (
          <p className={styles.note}>
            This is a memory level: tests run as a sequence of steps over time. The step-by-step
            view arrives in a later update; you can still build and run the tests.
          </p>
        )}
      </section>
    </>
  );
}
