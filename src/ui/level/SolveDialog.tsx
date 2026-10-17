/**
 * Shown when every test passes: metrics against the player's best, the chip they unlocked,
 * and the way on (spec §4 step 5).
 */
import { catalogue } from '../../content/index.ts';
import type { LevelDef } from '../../content/types.ts';
import { navigate } from '../../app/router.ts';
import { Modal } from '../components/Modal.tsx';
import type { SolveMetrics } from './solve.ts';
import { formatCount } from './solve.ts';
import styles from './SolveDialog.module.css';

export interface SolveResult {
  metrics: SolveMetrics | null;
  /** Best before this solve, if the level was solved before. */
  previousBest?: { count: number; delay?: number };
  improved: boolean;
}

export interface SolveDialogProps {
  level: LevelDef;
  result: SolveResult | null;
  onClose(): void;
}

export function SolveDialog({ level, result, onClose }: SolveDialogProps) {
  const next = catalogue.next(level.id);
  const unlock = level.unlocks;
  const metrics = result?.metrics;
  const best = result?.previousBest;

  return (
    <Modal open={!!result} onClose={onClose} label="Level solved" size="small">
      <div className={styles.solved}>
        <div className={styles.burst} aria-hidden="true">
          ⚡
        </div>
        <h2>Level solved!</h2>
        {metrics && (
          <dl className={styles.metrics}>
            <div>
              <dt>Parts</dt>
              <dd>{formatCount(metrics.count, metrics.unit)}</dd>
            </div>
            {metrics.delay !== undefined && (
              <div>
                <dt>Delay</dt>
                <dd>
                  {metrics.delay} {metrics.delay === 1 ? 'tick' : 'ticks'}
                </dd>
              </div>
            )}
          </dl>
        )}
        {best && (
          <p className={styles.best}>
            {result?.improved ? 'New personal best! ' : ''}
            Previous best: {formatCount(best.count, metrics?.unit ?? 'NAND')}
            {best.delay !== undefined && `, delay ${best.delay}`}.
          </p>
        )}
        {unlock && (
          <p className={styles.unlock}>
            <strong>{unlock.name}</strong> is now in your toolbox.
          </p>
        )}
        <div className={styles.buttons}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Keep optimizing
          </button>
          {next ? (
            <button
              type="button"
              className={styles.primary}
              autoFocus
              onClick={() => {
                onClose();
                navigate({ name: 'level', id: next.id });
              }}
            >
              Next: {next.id} {next.title} →
            </button>
          ) : (
            <button
              type="button"
              className={styles.primary}
              autoFocus
              onClick={() => {
                onClose();
                navigate({ name: 'map' });
              }}
            >
              Back to the map
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
