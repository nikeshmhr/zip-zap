/**
 * Pannable, zoomable SVG canvas with a dot grid (plan §6). Children draw in world space
 * (grid units). Wheel pans; Ctrl/⌘ + wheel or a trackpad pinch zooms around the cursor.
 * Middle-drag or Space + drag pans. Other pointer events are passed up with world coordinates.
 */
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { Point } from '../../engine/model.ts';
import type { Camera, Size } from './camera.ts';
import {
  UNIT,
  panBy,
  screenToWorld,
  viewBox,
  wheelPixels,
  wheelZoomFactor,
  zoomAt,
} from './camera.ts';
import styles from './Canvas.module.css';

export interface CanvasPointerEvent {
  world: Point;
  screen: Point;
  event: ReactPointerEvent<SVGSVGElement>;
}

export interface CanvasProps {
  camera: Camera;
  onCameraChange(camera: Camera): void;
  onSizeChange?(size: Size): void;
  onPointerDown?(e: CanvasPointerEvent): void;
  onPointerMove?(e: CanvasPointerEvent): void;
  onPointerUp?(e: CanvasPointerEvent): void;
  /** Data dropped onto the canvas (e.g. a part from the toolbox), at a world position. */
  onDropData?(data: DataTransfer, world: Point): void;
  /** Drawn in screen space over the canvas (badges, toasts). */
  overlay?: ReactNode;
  children?: ReactNode;
  label?: string;
}

/** Tracks whether the space bar is held, for Space + drag panning. */
function useSpaceHeld() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    // Space on a focused control (button, link, field) must keep doing its normal job.
    const isTyping = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement &&
      !!e.target.closest('button, a, input, textarea, select, [role="button"], [contenteditable]');
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        e.preventDefault();
        setHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setHeld(false);
    const blur = () => setHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return held;
}

export function Canvas(props: CanvasProps) {
  const { camera, onCameraChange, onSizeChange, overlay, children, label = 'Circuit' } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [panning, setPanning] = useState<{ last: Point } | null>(null);
  const spaceHeld = useSpaceHeld();
  // useId output contains colons, which aren't valid inside url(#…).
  const gridId = `grid${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  // Latest camera for the native wheel listener.
  const cameraRef = useRef(camera);
  const onCameraChangeRef = useRef(onCameraChange);
  useLayoutEffect(() => {
    cameraRef.current = camera;
    onCameraChangeRef.current = onCameraChange;
  });

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      const next = { width: rect.width, height: rect.height };
      setSize(next);
      onSizeChange?.(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
    // onSizeChange is read once per resize; callers pass a stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React's wheel handler is passive, so preventDefault needs a native listener.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const cam = cameraRef.current;
      const dx = wheelPixels(e.deltaX, e.deltaMode);
      const dy = wheelPixels(e.deltaY, e.deltaMode);
      if (e.ctrlKey || e.metaKey) {
        onCameraChangeRef.current(zoomAt(cam, point, wheelZoomFactor(dy)));
      } else {
        onCameraChangeRef.current(panBy(cam, { x: -dx, y: -dy }));
      }
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const toCanvasEvent = (event: ReactPointerEvent<SVGSVGElement>): CanvasPointerEvent => {
    const rect = event.currentTarget.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    return { screen, world: screenToWorld(screen, camera), event };
  };

  return (
    <div className={styles.wrap}>
      <svg
        ref={svgRef}
        className={styles.canvas}
        data-panning={panning || spaceHeld ? '' : undefined}
        viewBox={size.width > 0 ? viewBox(camera, size) : undefined}
        role="application"
        aria-label={label}
        onPointerDown={(event) => {
          if (event.button === 1 || (event.button === 0 && spaceHeld)) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setPanning({ last: { x: event.clientX, y: event.clientY } });
            return;
          }
          props.onPointerDown?.(toCanvasEvent(event));
        }}
        onPointerMove={(event) => {
          if (panning) {
            const delta = { x: event.clientX - panning.last.x, y: event.clientY - panning.last.y };
            onCameraChange(panBy(camera, delta));
            setPanning({ last: { x: event.clientX, y: event.clientY } });
            return;
          }
          props.onPointerMove?.(toCanvasEvent(event));
        }}
        onPointerUp={(event) => {
          if (panning) {
            setPanning(null);
            return;
          }
          props.onPointerUp?.(toCanvasEvent(event));
        }}
        onPointerCancel={() => setPanning(null)}
        onDragOver={(event) => {
          if (props.onDropData) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(event) => {
          if (!props.onDropData) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          props.onDropData(event.dataTransfer, screenToWorld(screen, camera));
        }}
      >
        <defs>
          <pattern id={gridId} width="2" height="2" patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="0.09" className={styles.dot} />
            <circle cx="2" cy="0" r="0.09" className={styles.dot} />
            <circle cx="0" cy="2" r="0.09" className={styles.dot} />
            <circle cx="2" cy="2" r="0.09" className={styles.dot} />
          </pattern>
        </defs>
        {size.width > 0 && (
          <rect
            x={camera.x}
            y={camera.y}
            width={size.width / (UNIT * camera.zoom)}
            height={size.height / (UNIT * camera.zoom)}
            fill={`url(#${gridId})`}
            pointerEvents="none"
          />
        )}
        {children}
      </svg>
      {overlay}
    </div>
  );
}
