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
  /** Part of the signal under the pointer. */
  highlighted?: boolean;
  onHover?(id: string | null): void;
}

export const WireView = memo(function WireView(props: WireViewProps) {
  const { id, points, on, selected, flagged, highlighted, onHover } = props;
  const d = polylinePath(points);
  return (
    <g
      className={styles.wire}
      data-wire={id}
      data-on={on || undefined}
      data-selected={selected || undefined}
      data-flagged={flagged || undefined}
      data-highlighted={highlighted || undefined}
      onPointerEnter={() => onHover?.(id)}
      onPointerLeave={() => onHover?.(null)}
    >
      <path className={styles.hit} d={d} />
      {selected && <path className={styles.halo} d={d} />}
      <path className={styles.line} d={d} />
      {on && <path className={styles.flow} d={d} />}
    </g>
  );
});
