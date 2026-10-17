import type { LevelDef } from '../../content/types.ts';
import { Markdown } from '../components/Markdown.tsx';
import { Modal } from '../components/Modal.tsx';
import styles from './ConceptCard.module.css';

/** The level's concept card (spec §9): shown on first visit, and on request. */
export function ConceptCard({
  level,
  open,
  onClose,
}: {
  level: LevelDef;
  open: boolean;
  onClose(): void;
}) {
  return (
    <Modal open={open} onClose={onClose} label={`About ${level.title}`}>
      <article className={styles.card}>
        <span className={styles.kicker}>Level {level.id}</span>
        <h2>{level.title}</h2>
        <div className={styles.body}>
          <Markdown text={level.concept} />
        </div>
        <p className={styles.goal}>
          <strong>Your goal:</strong> {level.summary}
        </p>
        <button type="button" className={styles.start} autoFocus onClick={onClose}>
          Let's build
        </button>
      </article>
    </Modal>
  );
}
