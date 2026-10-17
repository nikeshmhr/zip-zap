/**
 * The circuit editor: canvas, parts, wires, selection and pointer interaction (plan §6).
 * Editing goes through the editor store; pointer logic lives in interaction.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { Bit, ComponentKind, Point } from '../../engine/model.ts';
import type { ComponentResolver } from '../../engine/primitives.ts';
import type { ValidateOptions } from '../../engine/validate.ts';
import type { EditorStore } from '../../state/editorStore.ts';
import type { Camera, Size } from './camera.ts';
import { fitCamera } from './camera.ts';
import type { CanvasPointerEvent } from './Canvas.tsx';
import { Canvas } from './Canvas.tsx';
import {
  createGeometryLookup,
  findPin,
  partRect,
  pinFacing,
  pinWorld,
  polylinePath,
  rectsIntersect,
  routeWire,
} from './geometry.ts';
import { hitTest } from './hitTest.ts';
import type { Effect, InteractionContext, Mode, PointerInput } from './interaction.ts';
import { IDLE, cancel, normalizeRect, pointerDown, pointerMove, pointerUp } from './interaction.ts';
import type { LiveSnapshot } from './liveSimulation.ts';
import { LiveSimulation } from './liveSimulation.ts';
import { PartView } from './PartView.tsx';
import { WireView } from './WireView.tsx';
import styles from './CircuitEditor.module.css';
import wireStyles from './wires.module.css';

export interface CircuitEditorProps {
  store: EditorStore;
  resolve: ComponentResolver;
  displayName(kind: ComponentKind): string;
  label: string;
  /** The level's validation rules, used to refuse connections it would reject. */
  options?: ValidateOptions;
}

/** Shows a short message over the canvas, e.g. why a wire was refused. */
function useToast() {
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  return [toast, (message: string) => setToast({ message, key: Date.now() })] as const;
}

const isTyping = (e: KeyboardEvent) =>
  e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

export function CircuitEditor(props: CircuitEditorProps) {
  const { store, resolve, displayName, label, options } = props;
  const circuit = useStore(store, (s) => s.circuit);
  const selection = useStore(store, (s) => s.selection);
  const inputs = useStore(store, (s) => s.inputs);

  // Live simulation: one simulator per circuit version, so latches remember between toggles.
  const live = useMemo(() => new LiveSimulation(resolve, options), [resolve, options]);
  const snapshot = useMemo(() => live.evaluate(circuit, inputs), [live, circuit, inputs]);

  const geomOf = useMemo(() => createGeometryLookup(resolve, displayName), [resolve, displayName]);

  // Camera: fit the circuit once the canvas has a size.
  const [camera, setCamera] = useState<Camera>({ x: -4, y: -4, zoom: 1 });
  const fitted = useRef(false);
  const onSizeChange = useCallback(
    (size: Size) => {
      if (fitted.current || size.width === 0) return;
      fitted.current = true;
      const rects = store.getState().circuit.components.flatMap((c) => {
        const g = geomOf(c.kind);
        return g ? [partRect(c, g)] : [];
      });
      if (rects.length === 0) return;
      const bounds = {
        minX: Math.min(...rects.map((r) => r.x)) - 4,
        minY: Math.min(...rects.map((r) => r.y)) - 2,
        maxX: Math.max(...rects.map((r) => r.x + r.width)) + 4,
        maxY: Math.max(...rects.map((r) => r.y + r.height)) + 2,
      };
      setCamera(fitCamera(bounds, size, 3));
    },
    [store, geomOf],
  );

  // Interaction mode: a ref for handlers, state for rendering previews.
  const modeRef = useRef<Mode>(IDLE);
  const [mode, setMode] = useState<Mode>(IDLE);
  const [toast, showToast] = useToast();

  const context = (): InteractionContext => ({
    selection: store.getState().selection,
    partsInRect: (rect) =>
      store.getState().circuit.components.flatMap((c) => {
        const g = geomOf(c.kind);
        return g && rectsIntersect(partRect(c, g), rect) ? [c.id] : [];
      }),
  });

  const apply = (effects: Effect[]) => {
    const s = store.getState();
    for (const effect of effects) {
      switch (effect.type) {
        case 'select':
          s.select(effect.selection);
          break;
        case 'beginGesture':
          s.beginGesture();
          break;
        case 'endGesture':
          s.endGesture();
          break;
        case 'moveSelection':
          s.moveSelection(effect.delta);
          break;
        case 'toggleInput':
          s.toggleInput(effect.name);
          break;
        case 'connect': {
          const result = s.connect(effect.from, effect.to, { resolve, options });
          if (!result.ok) showToast(result.reason);
          break;
        }
      }
    }
  };

  const run = (transition: [Mode, Effect[]]) => {
    const [next, effects] = transition;
    modeRef.current = next;
    setMode(next);
    apply(effects);
  };

  const toInput = (e: CanvasPointerEvent): PointerInput => {
    // With pointer capture the event target is the canvas, so look up what's under the pointer.
    const under = document.elementFromPoint(e.event.clientX, e.event.clientY);
    return {
      hit: hitTest(under),
      world: e.world,
      screen: e.screen,
      additive: e.event.shiftKey || e.event.metaKey || e.event.ctrlKey,
    };
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === 'Escape' && modeRef.current.kind !== 'idle') {
        const [next, effects] = cancel(modeRef.current);
        modeRef.current = next;
        setMode(next);
        apply(effects);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && modeRef.current.kind === 'idle') {
        e.preventDefault();
        store.getState().deleteSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // apply only reads the store, which is stable for this editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(() => new Set(selection.components), [selection.components]);
  const selectedWires = useMemo(() => new Set(selection.wires), [selection.wires]);

  // Where each pin is, and which way its wire leaves.
  const pinAnchor = useCallback(
    (comp: string, pin: string, dir: 'in' | 'out'): { at: Point; facing: Point } | undefined => {
      const part = circuit.components.find((c) => c.id === comp);
      const geom = part && geomOf(part.kind);
      const pinGeom = geom && findPin(geom, pin, dir);
      if (!part || !geom || !pinGeom) return undefined;
      return { at: pinWorld(part, geom, pinGeom), facing: pinFacing(part, pinGeom) };
    },
    [circuit.components, geomOf],
  );

  const wires = useMemo(
    () =>
      circuit.wires.flatMap((w) => {
        const from = pinAnchor(w.from.comp, w.from.pin, 'out');
        const to = pinAnchor(w.to.comp, w.to.pin, 'in');
        if (!from || !to) return [];
        return [{ wire: w, points: routeWire(from.at, from.facing, to.at, to.facing) }];
      }),
    [circuit.wires, pinAnchor],
  );

  // Junction dots where several relay outputs are joined at one input.
  const junctions = useMemo(() => {
    const count = new Map<string, number>();
    for (const w of circuit.wires) {
      const key = `${w.to.comp}|${w.to.pin}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    return [...count].flatMap(([key, n]) => {
      if (n < 2) return [];
      const [comp = '', pin = ''] = key.split('|');
      const anchor = pinAnchor(comp, pin, 'in');
      return anchor ? [{ key, at: anchor.at, comp, pin }] : [];
    });
  }, [circuit.wires, pinAnchor]);

  const preview = useMemo(() => {
    if (mode.kind !== 'wiring') return null;
    const from = pinAnchor(mode.from.ref.comp, mode.from.ref.pin, mode.from.dir);
    if (!from) return null;
    const route =
      mode.from.dir === 'out'
        ? routeWire(from.at, from.facing, mode.cursor, { x: 0, y: 0 })
        : routeWire(mode.cursor, { x: 0, y: 0 }, from.at, from.facing);
    return polylinePath(route);
  }, [mode, pinAnchor]);
  const box = mode.kind === 'boxSelecting' ? normalizeRect(mode.start, mode.current) : null;

  return (
    <Canvas
      camera={camera}
      onCameraChange={setCamera}
      onSizeChange={onSizeChange}
      label={label}
      onPointerDown={(e) => {
        if (e.event.button !== 0) return;
        e.event.currentTarget.setPointerCapture(e.event.pointerId);
        run(pointerDown(modeRef.current, toInput(e), context()));
      }}
      onPointerMove={(e) => {
        if (modeRef.current.kind === 'idle') return;
        run(pointerMove(modeRef.current, toInput(e), context()));
      }}
      onPointerUp={(e) => run(pointerUp(modeRef.current, toInput(e), context()))}
      overlay={
        <>
          <StatusBadge snapshot={snapshot} />
          {toast && (
            <div key={toast.key} className={styles.toast} role="status">
              {toast.message}
            </div>
          )}
        </>
      }
    >
      {wires.map(({ wire, points }) => (
        <WireView
          key={wire.id}
          id={wire.id}
          points={points}
          on={snapshot.pin(wire.from.comp, wire.from.pin) === 1}
          selected={selectedWires.has(wire.id)}
          flagged={snapshot.flaggedWires.has(wire.id)}
        />
      ))}
      <g
        data-wiring={mode.kind === 'wiring' ? (mode.from.dir === 'out' ? 'in' : 'out') : undefined}
        className={styles.parts}
      >
        {circuit.components.map((part) => {
          const geom = geomOf(part.kind);
          if (!geom) return null;
          return (
            <PartView
              key={part.id}
              part={part}
              geom={geom}
              name={displayName(part.kind)}
              values={pinValues(snapshot, part.id, geom.pins)}
              selected={selected.has(part.id)}
              flagged={snapshot.flaggedParts.has(part.id)}
            />
          );
        })}
      </g>
      {junctions.map(({ key, at, comp, pin }) => (
        <circle
          key={key}
          className={wireStyles.junction}
          data-on={snapshot.pin(comp, pin) === 1 || undefined}
          cx={at.x}
          cy={at.y}
          r={0.28}
        />
      ))}
      {preview && <path className={wireStyles.preview} d={preview} />}
      {box && <rect className={styles.box} {...box} />}
    </Canvas>
  );
}

function pinValues(
  snapshot: LiveSnapshot,
  comp: string,
  pins: readonly { name: string }[],
): Record<string, Bit> {
  const values: Record<string, Bit> = {};
  for (const { name } of pins) values[name] = snapshot.pin(comp, name);
  return values;
}

const STATUS_TEXT: Record<Exclude<LiveSnapshot['status'], 'ok'>, string> = {
  unstable: 'Oscillating: this circuit never settles. Check your feedback loops.',
  short: 'Short circuit: two outputs are wired together.',
  invalid: 'This circuit has a problem.',
};

function StatusBadge({ snapshot }: { snapshot: LiveSnapshot }) {
  if (snapshot.status === 'ok') return null;
  const detail = snapshot.status === 'invalid' ? snapshot.issues[0]?.message : undefined;
  return (
    <div className={styles.badge} data-status={snapshot.status} role="alert">
      {detail ?? STATUS_TEXT[snapshot.status]}
    </div>
  );
}
