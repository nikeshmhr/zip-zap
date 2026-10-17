/**
 * Draws one part in world space (plan §6). Pins carry `data-pin="part|pin|dir"` and parts
 * carry `data-part`, so pointer handlers can tell what was hit. Level input switches carry
 * `data-toggle` with their pin name.
 */
import { memo } from 'react';
import type { Bit, ComponentInstance, Rotation } from '../../engine/model.ts';
import { isChipKind } from '../../engine/model.ts';
import type { PartGeom } from './geometry.ts';
import { pinKeyAttr } from './hitTest.ts';
import { partRect, partTransform } from './geometry.ts';
import styles from './parts.module.css';

export interface PartViewProps {
  part: ComponentInstance;
  geom: PartGeom;
  /** Display name (chips, and the label for unnamed IO). */
  name: string;
  /** Current pin values by pin name; missing pins are OFF. */
  values?: Readonly<Record<string, Bit>>;
  selected?: boolean;
  /** Highlighted as part of a problem (e.g. a short). */
  flagged?: boolean;
  /** A picture only (e.g. a toolbox preview): no hit-testing attributes. */
  decorative?: boolean;
  /** Pins a wire being drawn can't end on (dimmed instead of highlighted). */
  blockedPins?: ReadonlySet<string>;
}

/** Primitives whose pin names aren't printed on the part; they appear on hover. */
const HOVER_LABELLED = new Set<string>(['nand', 'relayNO', 'relayNC']);

/** Contact arm angles (degrees) for a closed and an open relay. */
const ARM_CLOSED = -22.2;
const ARM_OPEN = 11.3;

type Anchor = 'start' | 'middle' | 'end';

/**
 * Text attributes that keep a label upright when its part is rotated: counter-rotate it about
 * its anchor point, and flip start/end anchors upside down so it stays inside the part.
 */
function upright(x: number, y: number, rot: Rotation, anchor: Anchor) {
  if (rot === 0) return { x, y, textAnchor: anchor };
  const flipped: Record<Anchor, Anchor> = { start: 'end', middle: 'middle', end: 'start' };
  return {
    x,
    y,
    textAnchor: rot === 180 ? flipped[anchor] : 'middle',
    transform: `rotate(${-rot} ${x} ${y})`,
  };
}

function Body(props: PartViewProps) {
  const { part, geom, name, values = {} } = props;
  const { width: w, height: h } = geom;
  const on = (pin: string) => values[pin] === 1;

  switch (part.kind) {
    case 'nand':
      return (
        <>
          <line className={styles.lead} x1={0} y1={1} x2={1} y2={1} />
          <line className={styles.lead} x1={0} y1={3} x2={1} y2={3} />
          <path className={styles.body} d="M1 0.4 H2.2 A1.6 1.6 0 0 1 2.2 3.6 H1 Z" />
          <circle className={styles.body} cx={4.08} cy={2} r={0.26} />
          <line className={styles.lead} x1={4.34} y1={2} x2={5} y2={2} />
        </>
      );

    case 'relayNO':
    case 'relayNC': {
      const energised = on('coil');
      const closed = part.kind === 'relayNO' ? energised : !energised;
      return (
        <>
          <rect className={styles.casing} x={0.6} y={0.2} width={3.8} height={3.6} rx={0.4} />
          <line className={styles.lead} x1={0} y1={1} x2={0.8} y2={1} />
          <path
            className={styles.coil}
            data-on={energised || undefined}
            d="M0.8 1 l0.25 -0.4 l0.3 0.8 l0.3 -0.8 l0.3 0.8 l0.25 -0.4"
          />
          <line className={styles.linkage} x1={1.6} y1={1.5} x2={2.3} y2={2.45} />
          <line className={styles.lead} x1={0} y1={3} x2={1.4} y2={3} />
          <circle className={styles.joint} cx={1.4} cy={3} r={0.15} />
          {/* The arm pivots at (1.4, 3); rotating it (rather than moving its end) animates. */}
          <g transform="translate(1.4 3)">
            <line
              className={styles.arm}
              x1={0}
              y1={0}
              x2={2.3}
              y2={0}
              style={{ transform: `rotate(${closed ? ARM_CLOSED : ARM_OPEN}deg)` }}
            />
          </g>
          <circle className={styles.joint} cx={3.6} cy={2} r={0.15} />
          <line className={styles.lead} x1={3.6} y1={2} x2={5} y2={2} />
          <text className={styles.tag} {...upright(4.2, 0.75, part.rot, 'end')}>
            {part.kind === 'relayNO' ? 'NO' : 'NC'}
          </text>
        </>
      );
    }

    case 'power':
      return (
        <>
          <circle className={styles.body} cx={1} cy={1} r={0.8} />
          <path className={styles.bolt} d="M1.15 0.45 L0.7 1.1 H1.05 L0.85 1.6 L1.35 0.9 H1 Z" />
          <line className={styles.lead} x1={1.8} y1={1} x2={2} y2={1} />
        </>
      );

    case 'const0':
    case 'const1':
      return (
        <>
          <rect className={styles.body} x={0.2} y={0.2} width={1.6} height={1.6} rx={0.3} />
          <text className={styles.constant} {...upright(1, 1, part.rot, 'middle')}>
            {part.kind === 'const1' ? '1' : '0'}
          </text>
        </>
      );

    case 'in': {
      const value = on('out');
      return (
        <>
          <text className={styles.ioLabel} x={-0.5} y={1} textAnchor="end">
            {part.label ?? name}
          </text>
          <rect
            className={styles.toggle}
            data-on={value || undefined}
            data-toggle={props.decorative ? undefined : part.label}
            x={0.1}
            y={0.35}
            width={2.3}
            height={1.3}
            rx={0.65}
          />
          <circle
            className={styles.knob}
            cx={value ? 1.75 : 0.75}
            cy={1}
            r={0.45}
            pointerEvents="none"
          />
          <line className={styles.lead} x1={2.4} y1={1} x2={3} y2={1} />
        </>
      );
    }

    case 'out': {
      const lit = on('in');
      return (
        <>
          <line className={styles.lead} x1={0} y1={1} x2={0.7} y2={1} />
          <circle className={styles.lamp} data-on={lit || undefined} cx={1.6} cy={1} r={0.9} />
          <text className={styles.ioLabel} x={3.1} y={1} textAnchor="start">
            {part.label ?? name}
          </text>
        </>
      );
    }

    default: {
      if (!isChipKind(part.kind)) return null;
      return (
        <>
          <rect className={styles.chip} x={0.5} y={0} width={w - 1} height={h} rx={0.5} />
          {geom.pins.map((pin) => (
            <g key={`${pin.dir}:${pin.name}`}>
              <line
                className={styles.lead}
                x1={pin.dir === 'in' ? 0 : w - 0.5}
                y1={pin.y}
                x2={pin.dir === 'in' ? 0.5 : w}
                y2={pin.y}
              />
              <text
                className={styles.pinLabel}
                {...upright(
                  pin.dir === 'in' ? 0.85 : w - 0.85,
                  pin.y,
                  part.rot,
                  pin.dir === 'in' ? 'start' : 'end',
                )}
              >
                {pin.name}
              </text>
            </g>
          ))}
        </>
      );
    }
  }
}

export const PartView = memo(function PartView(props: PartViewProps) {
  const { part, geom, values = {}, selected, flagged, decorative } = props;
  const rect = partRect(part, geom);
  return (
    <>
      <g
        className={styles.part}
        data-part={decorative ? undefined : part.id}
        data-kind={decorative ? undefined : part.kind}
        data-selected={selected || undefined}
        data-flagged={flagged || undefined}
        transform={partTransform(part, geom)}
      >
        {/* Generous transparent hit area for selecting and dragging. */}
        <rect className={styles.hit} x={0} y={0} width={geom.width} height={geom.height} />
        {selected && (
          <rect
            className={styles.selection}
            x={-0.4}
            y={-0.4}
            width={geom.width + 0.8}
            height={geom.height + 0.8}
            rx={0.6}
          />
        )}
        <Body {...props} />
        {geom.pins.map((pin) => (
          <g
            key={`${pin.dir}:${pin.name}`}
            className={styles.pinGroup}
            data-pin={decorative ? undefined : pinKeyAttr(part.id, pin.name, pin.dir)}
            data-blocked={props.blockedPins?.has(pin.name) || undefined}
          >
            {/* A larger invisible target makes pins easy to grab. */}
            {!decorative && <circle className={styles.pinHit} cx={pin.x} cy={pin.y} r={0.7} />}
            <circle
              className={styles.pin}
              data-on={values[pin.name] === 1 || undefined}
              cx={pin.x}
              cy={pin.y}
              r={0.32}
            />
            {!decorative && HOVER_LABELLED.has(part.kind) && (
              <text
                className={styles.hoverLabel}
                {...upright(
                  pin.x + (pin.dir === 'in' ? -0.6 : 0.6),
                  pin.y - 0.6,
                  part.rot,
                  pin.dir === 'in' ? 'end' : 'start',
                )}
              >
                {pin.name}
              </text>
            )}
          </g>
        ))}
      </g>
      {isChipKind(part.kind) && (
        <text className={styles.chipName} x={rect.x + rect.width / 2} y={rect.y - 0.55}>
          {props.name}
        </text>
      )}
    </>
  );
});
