/**
 * A level: header, editor with the level's toolbox, and the goal panel (plan §8).
 */
import { chipFamily } from '../chipFamily.ts';
import { useMemo, useState } from 'react';
import { catalogue } from '../../content/index.ts';
import type { LevelDef } from '../../content/types.ts';
import { routeHref } from '../../app/router.ts';
import { levelEditor, useProgress } from '../../state/session.ts';
import { CircuitEditor } from '../editor/CircuitEditor.tsx';
import { Placeholder } from '../screens/Placeholder.tsx';
import { ConceptCard } from './ConceptCard.tsx';
import { GoalPanel } from './GoalPanel.tsx';
import { formatCount, solveMetrics } from './solve.ts';
import type { SolveResult } from './SolveDialog.tsx';
import { SolveDialog } from './SolveDialog.tsx';
import styles from './LevelScreen.module.css';

export function LevelScreen({ id }: { id: string }) {
  const level = catalogue.levels.find((l) => l.id === id);
  if (!level) {
    return (
      <Placeholder title="Level not found">
        <p>
          There's no level {id}. <a href={routeHref({ name: 'map' })}>Back to the map</a>
        </p>
      </Placeholder>
    );
  }
  return <Level key={level.id} level={level} />;
}

function Level({ level }: { level: LevelDef }) {
  const store = useMemo(() => levelEditor(level.id, catalogue.canvasIo(level.id)), [level]);
  const options = useMemo(() => catalogue.validateOptions(level.id), [level.id]);
  const chapter = catalogue.chapters.find((c) => c.id === level.chapter);
  const progress = useProgress((s) => s.get(level.id));
  const [solved, setSolved] = useState<SolveResult | null>(null);
  // The concept card opens by itself on a level's first visit.
  const [conceptOpen, setConceptOpen] = useState(
    () => !useProgress.getState().get(level.id).conceptSeen,
  );
  const closeConcept = () => {
    setConceptOpen(false);
    useProgress.getState().markConceptSeen(level.id);
  };
  const unit = level.chapter === 0 ? 'relay' : 'NAND';

  return (
    <div className={styles.level}>
      <header className={styles.header}>
        <a className={styles.back} href={routeHref({ name: 'map' })} aria-label="Back to the map">
          ←
        </a>
        <div className={styles.titles}>
          <span className={styles.chapter}>
            Chapter {level.chapter} · {chapter?.title}
          </span>
          <h1 className={styles.title}>
            <span className={styles.number}>{level.id}</span> {level.title}
          </h1>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={() => setConceptOpen(true)}>
            About this level
          </button>
          {progress.solved && progress.best && (
            <span className={styles.badge} title="Your best solution">
              ✓ Solved · best {formatCount(progress.best.count, unit)}
              {progress.best.delay !== undefined && `, delay ${progress.best.delay}`}
            </span>
          )}
        </div>
      </header>
      <div className={styles.body}>
        <CircuitEditor
          store={store}
          resolve={catalogue.resolve}
          displayName={catalogue.displayName}
          label={`Level ${level.id} circuit`}
          options={options}
          family={chipFamily}
          toolbox={catalogue.toolbox(level.id)}
        />
        <aside className={styles.panel} aria-label="Level">
          <GoalPanel
            level={level}
            store={store}
            onSolved={(_, circuit) => {
              const metrics = solveMetrics(level, circuit);
              const previousBest = useProgress.getState().get(level.id).best;
              const improved = useProgress
                .getState()
                .markSolved(level.id, metrics ?? { count: 0 }, circuit);
              setSolved({ metrics, previousBest, improved });
            }}
          />
        </aside>
      </div>
      <SolveDialog level={level} result={solved} onClose={() => setSolved(null)} />
      <ConceptCard level={level} open={conceptOpen} onClose={closeConcept} />
    </div>
  );
}
