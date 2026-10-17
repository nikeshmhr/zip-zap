/**
 * One wire. ON wires are thick and solid with a glow; OFF wires are thin and dashed, so the
 * state reads without colour (spec §11). A wide transparent stroke makes wires easy to click.
 */
import { memo } from 'react';
import type { Point } from '../../engine/model.ts';
import { polylinePath } from './geometry.ts';
import styles from './wires.module.css';

export interface WireViewProps {
  id: string;
  points: readonly Point[];
  on?: boolean;
  selected?: boolean;
  flagged?: boolean;
}

export const WireView = memo(function WireView({
  id,
  points,
  on,
  selected,
  flagged,
}: WireViewProps) {
  const d = polylinePath(points);
  return (
    <g
      className={styles.wire}
      data-wire={id}
      data-on={on || undefined}
      data-selected={selected || undefined}
      data-flagged={flagged || undefined}
    >
      <path className={styles.hit} d={d} />
      {selected && <path className={styles.halo} d={d} />}
      <path className={styles.line} d={d} />
      {on && <path className={styles.flow} d={d} />}
    </g>
  );
});
