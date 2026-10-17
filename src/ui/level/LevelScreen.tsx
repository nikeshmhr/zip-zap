/**
 * A level: header, editor with the level's toolbox, and the goal panel (plan §8).
 */
import { useMemo } from 'react';
import { catalogue } from '../../content/index.ts';
import type { LevelDef } from '../../content/types.ts';
import { routeHref } from '../../app/router.ts';
import { levelEditor } from '../../state/session.ts';
import { CircuitEditor } from '../editor/CircuitEditor.tsx';
import { Placeholder } from '../screens/Placeholder.tsx';
import { GoalPanel } from './GoalPanel.tsx';
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
  const store = useMemo(() => levelEditor(level.id, level), [level]);
  const options = useMemo(() => catalogue.validateOptions(level.id), [level.id]);
  const chapter = catalogue.chapters.find((c) => c.id === level.chapter);

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
        <div className={styles.actions} />
      </header>
      <div className={styles.body}>
        <CircuitEditor
          store={store}
          resolve={catalogue.resolve}
          displayName={catalogue.displayName}
          label={`Level ${level.id} circuit`}
          options={options}
          toolbox={catalogue.toolbox(level.id)}
        />
        <aside className={styles.panel} aria-label="Level">
          <GoalPanel level={level} store={store} />
        </aside>
      </div>
    </div>
  );
}
