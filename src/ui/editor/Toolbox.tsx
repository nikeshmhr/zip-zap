/**
 * The parts the player may place (plan §8). Drag an item onto the canvas, or click it (or
 * press Enter) to drop it in the middle of the view.
 */
import type { ChipKind, ComponentKind } from '../../engine/model.ts';
import { isChipKind } from '../../engine/model.ts';
import type { PartGeom } from './geometry.ts';
import { PartView } from './PartView.tsx';
import styles from './Toolbox.module.css';

export const KIND_MIME = 'application/x-zipzap-kind';

export interface ToolboxProps {
  kinds: readonly ComponentKind[];
  displayName(kind: ComponentKind): string;
  geomOf(kind: ComponentKind): PartGeom | undefined;
  onAdd(kind: ComponentKind): void;
  family?(kind: ComponentKind): string | undefined;
  /** Looks inside a chip. */
  onInspect?(kind: ChipKind): void;
}

function Preview({
  kind,
  geom,
  name,
  family,
}: {
  kind: ComponentKind;
  geom: PartGeom;
  name: string;
  family?: string;
}) {
  const pad = 1;
  const top = isChipKind(kind) ? 1.4 : 0; // room for the chip title
  return (
    <svg
      className={styles.preview}
      viewBox={`${-pad} ${-pad - top} ${geom.width + pad * 2} ${geom.height + pad * 2 + top}`}
      aria-hidden="true"
    >
      <PartView
        part={{ id: `preview-${kind}`, kind, pos: { x: 0, y: 0 }, rot: 0 }}
        geom={geom}
        name={name}
        family={family}
        decorative
      />
    </svg>
  );
}

export function Toolbox({ kinds, displayName, geomOf, onAdd, family, onInspect }: ToolboxProps) {
  const groups = [
    { title: 'Parts', kinds: kinds.filter((k) => !isChipKind(k)) },
    { title: 'Your chips', kinds: kinds.filter(isChipKind) },
  ].filter((g) => g.kinds.length > 0);

  return (
    <aside className={styles.toolbox} aria-label="Toolbox">
      {groups.map((group) => (
        <section key={group.title}>
          <h2 className={styles.heading}>{group.title}</h2>
          <ul className={styles.list}>
            {group.kinds.map((kind) => {
              const geom = geomOf(kind);
              const name = displayName(kind);
              return (
                <li key={kind} className={styles.slot}>
                  <button
                    type="button"
                    className={styles.item}
                    draggable
                    data-tool={kind}
                    title={`${name}: drag onto the canvas, or click to add`}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(KIND_MIME, kind);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => onAdd(kind)}
                  >
                    {geom && (
                      <Preview kind={kind} geom={geom} name={name} family={family?.(kind)} />
                    )}
                    <span className={styles.name}>{name}</span>
                  </button>
                  {onInspect && isChipKind(kind) && (
                    <button
                      type="button"
                      className={styles.inspect}
                      aria-label={`Look inside ${name}`}
                      title={`Look inside ${name}`}
                      onClick={() => onInspect(kind)}
                    >
                      ⌕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </aside>
  );
}
