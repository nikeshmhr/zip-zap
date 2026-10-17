import type { ReactNode } from 'react';
import styles from './Placeholder.module.css';

/** Temporary screen body until the real screen lands (see specs/tasks.md). */
export function Placeholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className={styles.placeholder}>
      <h1>{title}</h1>
      {children}
    </section>
  );
}
