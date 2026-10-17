import type { LevelDef } from '../../content/types.ts';
import { useProgress } from '../../state/session.ts';
import styles from './Hints.module.css';

/** Two progressive hints (spec §9): a nudge, then a strong hint. */
export function Hints({ level }: { level: LevelDef }) {
  const shown = useProgress((s) => s.get(level.id).hints);
  const reveal = () => useProgress.getState().revealHint(level.id);

  return (
    <section className={styles.hints} aria-label="Hints">
      {level.hints.slice(0, shown).map((hint, i) => (
        <p key={i} className={styles.hint}>
          <span className={styles.label}>Hint {i + 1}</span>
          {hint}
        </p>
      ))}
      {shown < level.hints.length && (
        <button type="button" className={styles.reveal} onClick={reveal}>
          {shown === 0 ? 'Need a hint?' : 'Show a stronger hint'}
        </button>
      )}
    </section>
  );
}
