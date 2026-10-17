/**
 * The level map (spec §9): chapters as rows of levels with their status and best metrics,
 * a Continue button, and the sandbox.
 */
import { catalogue } from '../../content/index.ts';
import { routeHref } from '../../app/router.ts';
import { useLevelStatuses, useNextLevel } from '../../state/levelStatus.ts';
import { useProgress } from '../../state/session.ts';
import { formatCount } from '../level/solve.ts';
import styles from './MapScreen.module.css';

const STATUS_TEXT = { locked: 'Locked', available: 'Ready to play', solved: 'Solved' } as const;

export function MapScreen() {
  const statuses = useLevelStatuses();
  const levels = useProgress((s) => s.levels);
  const nextId = useNextLevel();
  const next = nextId ? catalogue.level(nextId) : undefined;
  const solvedCount = [...statuses.values()].filter((s) => s === 'solved').length;

  return (
    <div className={styles.map}>
      <header className={styles.hero}>
        <div>
          <h1>Build a computer from relays up</h1>
          <p>
            Every level you solve becomes a chip you can use in the next. {solvedCount} of{' '}
            {catalogue.levels.length} levels solved.
          </p>
        </div>
        {next ? (
          <a className={styles.continue} href={routeHref({ name: 'level', id: next.id })}>
            {solvedCount === 0 ? 'Start' : 'Continue'}: {next.id} {next.title} →
          </a>
        ) : (
          <span className={styles.done}>Every level solved. Try the sandbox!</span>
        )}
      </header>

      {catalogue.chapters.map((chapter) => {
        const chapterLevels = catalogue.levels.filter((l) => l.chapter === chapter.id);
        const solved = chapterLevels.filter((l) => statuses.get(l.id) === 'solved').length;
        return (
          <section
            key={chapter.id}
            className={styles.chapter}
            aria-labelledby={`chapter-${chapter.id}`}
          >
            <div className={styles.chapterHead}>
              <h2 id={`chapter-${chapter.id}`}>
                <span className={styles.chapterNumber}>Chapter {chapter.id}</span> {chapter.title}
              </h2>
              <p>{chapter.blurb}</p>
              <span className={styles.count}>
                {solved}/{chapterLevels.length}
              </span>
            </div>
            <ol className={styles.levels}>
              {chapterLevels.map((level) => {
                const status = statuses.get(level.id) ?? 'locked';
                const best = levels[level.id]?.best;
                const content = (
                  <>
                    <span className={styles.icon} aria-hidden="true">
                      {status === 'solved' ? '✓' : status === 'available' ? '▶' : '🔒'}
                    </span>
                    <span className={styles.id}>{level.id}</span>
                    <span className={styles.title}>{level.title}</span>
                    <span className={styles.meta}>
                      {status === 'solved' && best
                        ? `${formatCount(best.count, level.chapter === 0 ? 'relay' : 'NAND')}${
                            best.delay !== undefined ? ` · delay ${best.delay}` : ''
                          }`
                        : STATUS_TEXT[status]}
                    </span>
                  </>
                );
                return (
                  <li key={level.id}>
                    {status === 'locked' ? (
                      <span className={styles.level} data-status={status} aria-disabled="true">
                        {content}
                      </span>
                    ) : (
                      <a
                        className={styles.level}
                        data-status={status}
                        href={routeHref({ name: 'level', id: level.id })}
                        aria-label={`${level.id} ${level.title}, ${STATUS_TEXT[status].toLowerCase()}`}
                      >
                        {content}
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      <a className={styles.sandbox} href={routeHref({ name: 'sandbox' })}>
        <strong>Sandbox</strong>
        <span>Build freely with every part and chip you've unlocked.</span>
      </a>
    </div>
  );
}
