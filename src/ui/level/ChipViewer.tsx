/**
 * Look inside a chip (T7.1): the player's own design for it (or the reference design if they
 * haven't built it), read-only but live: toggle its switches to watch it work, and double-click
 * chips inside to go deeper.
 */
import { useMemo } from 'react';
import { catalogue } from '../../content/index.ts';
import type { ChipKind } from '../../engine/model.ts';
import { chipIdOf } from '../../engine/model.ts';
import { createEditorStore } from '../../state/editorStore.ts';
import { chipFamily } from '../chipFamily.ts';
import { Modal } from '../components/Modal.tsx';
import { CircuitEditor } from '../editor/CircuitEditor.tsx';
import { chipSource, formatCount, solveMetrics } from './solve.ts';
import styles from './ChipViewer.module.css';

export interface ChipViewerProps {
  /** The chips opened so far, outermost first; empty when closed. */
  path: readonly ChipKind[];
  onPathChange(path: readonly ChipKind[]): void;
}

function Inside({ kind, onOpen }: { kind: ChipKind; onOpen(kind: ChipKind): void }) {
  const source = useMemo(() => chipSource(chipIdOf(kind)), [kind]);
  const store = useMemo(() => (source ? createEditorStore(source.design) : null), [source]);
  if (!source || !store) return <p>There's nothing to show inside this chip.</p>;
  const level = catalogue.level(source.levelId);
  const metrics = solveMetrics(level, source.design);
  return (
    <>
      <p className={styles.note}>
        {source.mine ? 'Your design' : "The reference design (you haven't built this chip yet)"}
        {metrics &&
          ` · ${formatCount(metrics.count, metrics.unit)}${metrics.delay !== undefined ? `, delay ${metrics.delay}` : ''}`}
        . Flip the switches to watch it work; double-click a chip to look inside it.
      </p>
      <div className={styles.canvas}>
        <CircuitEditor
          key={kind}
          store={store}
          resolve={catalogue.resolve}
          displayName={catalogue.displayName}
          label={`Inside ${catalogue.displayName(kind)}`}
          family={chipFamily}
          toolbox={[]}
          readOnly
          onOpenChip={onOpen}
        />
      </div>
    </>
  );
}

export function ChipViewer({ path, onPathChange }: ChipViewerProps) {
  const current = path.at(-1);
  return (
    <Modal
      open={!!current}
      onClose={() => onPathChange([])}
      label={current ? `Inside ${catalogue.displayName(current)}` : 'Inside a chip'}
      size="large"
    >
      {current && (
        <div className={styles.viewer}>
          <header className={styles.header}>
            <nav aria-label="Chips opened" className={styles.crumbs}>
              {path.map((kind, i) => (
                <span key={`${kind}-${i}`}>
                  {i > 0 && <span aria-hidden="true"> › </span>}
                  {i < path.length - 1 ? (
                    <button type="button" onClick={() => onPathChange(path.slice(0, i + 1))}>
                      {catalogue.displayName(kind)}
                    </button>
                  ) : (
                    <strong>{catalogue.displayName(kind)}</strong>
                  )}
                </span>
              ))}
            </nav>
            <button type="button" className={styles.close} onClick={() => onPathChange([])}>
              Close
            </button>
          </header>
          <Inside kind={current} onOpen={(kind) => onPathChange([...path, kind])} />
        </div>
      )}
    </Modal>
  );
}
