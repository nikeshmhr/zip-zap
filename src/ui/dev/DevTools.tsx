/**
 * A small Dev popover for playtesting (development server only): load or solve the current
 * level with its reference solution, reset it, or unlock levels. Destructive actions ask for a
 * second click.
 */
import { useEffect, useRef, useState } from 'react';
import {
  loadSolution,
  resetLevel,
  solveBefore,
  solveLevel,
  unlockAll,
} from '../../app/devActions.ts';
import type { Route } from '../../app/router.ts';
import { catalogue } from '../../content/index.ts';
import styles from './DevTools.module.css';

type Action = 'load' | 'solve' | 'reset';

const LABELS: Record<Action, { idle: string; confirm: string }> = {
  load: { idle: 'Load solution', confirm: 'Replace my circuit?' },
  solve: { idle: 'Solve level', confirm: 'Replace and mark solved?' },
  reset: { idle: 'Reset to empty', confirm: 'Clear my circuit?' },
};

export default function DevTools({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState<Action | null>(null);
  const [unlockTo, setUnlockTo] = useState(catalogue.levels[1]?.id ?? '');
  const [done, setDone] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const levelId =
    route.name === 'level' && catalogue.levels.some((l) => l.id === route.id) ? route.id : null;

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const report = (message: string) => {
    setDone(message);
    setArmed(null);
  };

  const run = (action: Action) => {
    if (!levelId) return;
    if (armed !== action) {
      setArmed(action);
      return;
    }
    if (action === 'load') loadSolution(levelId);
    if (action === 'solve') solveLevel(levelId);
    if (action === 'reset') resetLevel(levelId);
    report(
      action === 'load'
        ? `Loaded ${levelId}'s solution. Press F to fit it in view.`
        : action === 'solve'
          ? `${levelId} solved with its reference design.`
          : `${levelId} reset.`,
    );
  };

  return (
    <div className={styles.dev} ref={ref}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls="dev-tools"
        onClick={() => {
          setOpen(!open);
          setArmed(null);
          setDone(null);
        }}
      >
        Dev
      </button>
      {open && (
        <div className={styles.panel} id="dev-tools" role="dialog" aria-label="Developer tools">
          <h2>Developer tools</h2>
          <p className={styles.note}>Development server only.</p>

          <section>
            <h3>{levelId ? `Level ${levelId}` : 'Current level'}</h3>
            {levelId ? (
              <div className={styles.actions}>
                {(['load', 'solve', 'reset'] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    data-armed={armed === action || undefined}
                    onClick={() => run(action)}
                  >
                    {armed === action ? LABELS[action].confirm : LABELS[action].idle}
                  </button>
                ))}
              </div>
            ) : (
              <p className={styles.note}>Open a level to load, solve or reset it.</p>
            )}
          </section>

          <section>
            <h3>Progress</h3>
            <div className={styles.actions}>
              <label className={styles.unlock}>
                Unlock up to
                <select value={unlockTo} onChange={(e) => setUnlockTo(e.target.value)}>
                  {catalogue.levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.id} {l.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  solveBefore(unlockTo);
                  report(`Every level before ${unlockTo} is solved.`);
                }}
              >
                Unlock
              </button>
              <button
                type="button"
                onClick={() => {
                  unlockAll();
                  report('Every level is solved.');
                }}
              >
                Unlock all
              </button>
            </div>
          </section>

          {done && (
            <p className={styles.done} role="status">
              {done}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
