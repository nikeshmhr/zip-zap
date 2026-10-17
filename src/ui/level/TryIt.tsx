/**
 * The level's switches as real buttons and its lamps as announced text (spec §11): the
 * keyboard and screen-reader way to try a circuit, and a handy readout for everyone.
 */
import { useStore } from 'zustand';
import type { LevelDef } from '../../content/types.ts';
import type { EditorStore } from '../../state/editorStore.ts';
import styles from './TryIt.module.css';

export function TryIt({ level, store }: { level: LevelDef; store: EditorStore }) {
  const inputs = useStore(store, (s) => s.inputs);
  const lamps = useStore(store, (s) => s.lamps);
  return (
    <section className={styles.tryIt} aria-label="Try it">
      <div className={styles.row}>
        <span className={styles.label}>Switches</span>
        {level.inputs.map((name, i) => (
          <button
            key={name}
            type="button"
            className={styles.switch}
            aria-pressed={inputs[name] === 1}
            title={i < 9 ? `Toggle ${name} (key ${i + 1})` : `Toggle ${name}`}
            onClick={() => store.getState().toggleInput(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className={styles.row} aria-live="polite">
        <span className={styles.label}>Lamps</span>
        {level.outputs.map((name) => (
          <span key={name} className={styles.lamp} data-on={lamps[name] === 1 || undefined}>
            {name} {lamps[name] === 1 ? 'ON' : 'OFF'}
          </span>
        ))}
      </div>
    </section>
  );
}
