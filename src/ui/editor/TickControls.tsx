/**
 * Tick-by-tick mode controls (T6.4): watch signals move one gate delay at a time.
 */
import styles from './TickControls.module.css';

export interface TickControlsProps {
  on: boolean;
  ticks: number;
  settled: boolean;
  onToggle(): void;
  onNext(): void;
}

export function TickControls({ on, ticks, settled, onToggle, onNext }: TickControlsProps) {
  return (
    <div className={styles.bar} role="group" aria-label="Tick by tick">
      <button
        type="button"
        className={styles.toggle}
        aria-pressed={on}
        onClick={onToggle}
        title="Slow the circuit down: every part takes one tick to respond"
      >
        Tick by tick
      </button>
      {on && (
        <>
          <button type="button" className={styles.next} onClick={onNext} disabled={settled}>
            Next tick ▸
          </button>
          <span className={styles.status} aria-live="polite">
            Tick {ticks} · {settled ? 'settled' : 'still changing'}
          </span>
        </>
      )}
    </div>
  );
}
