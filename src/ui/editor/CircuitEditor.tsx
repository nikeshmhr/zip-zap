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
import { fitCamera, screenToWorld } from './camera.ts';
import type { CanvasPointerEvent } from './Canvas.tsx';
import { Canvas } from './Canvas.tsx';
import {
  createGeometryLookup,
  findFreeSpot,
  findPin,
  partRect,
  pinFacing,
  pinWorld,
  polylinePath,
  rectsIntersect,
  routeWire,
  routeWires,
  branchPoint,
} from './geometry.ts';
import type { WireRequest } from './geometry.ts';
import { hitTest } from './hitTest.ts';
import type { Effect, InteractionContext, Mode, PointerInput } from './interaction.ts';
import type { PinEnd } from './interaction.ts';
import { IDLE, cancel, normalizeRect, pointerDown, pointerMove, pointerUp } from './interaction.ts';
import type { LiveSnapshot } from './liveSimulation.ts';
import { LiveSimulation } from './liveSimulation.ts';
import { PartView } from './PartView.tsx';
import { HelpPanel } from './HelpPanel.tsx';
import { shortcutFor } from './shortcuts.ts';
import { TickControls } from './TickControls.tsx';
import { KIND_MIME, Toolbox } from './Toolbox.tsx';
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
  /** Kinds the player may place. */
  toolbox: readonly ComponentKind[];
  /** Chip family for tinting, if any. */
  family?(kind: ComponentKind): string | undefined;
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

/** How close (grid units) a dropped wire must be to a pin to snap onto it. */
const SNAP_DISTANCE = 1.25;

const isTyping = (e: KeyboardEvent) =>
  e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

export function CircuitEditor(props: CircuitEditorProps) {
  const { store, resolve, displayName, label, options, toolbox, family } = props;
  const circuit = useStore(store, (s) => s.circuit);
  const selection = useStore(store, (s) => s.selection);
  const inputs = useStore(store, (s) => s.inputs);
  const replay = useStore(store, (s) => s.replay);
  const tick = useStore(store, (s) => s.tick);

  // Live simulation: one simulator per circuit version, so latches remember between toggles.
  const live = useMemo(() => new LiveSimulation(resolve, options), [resolve, options]);
  const snapshot = useMemo(
    () => live.evaluate(circuit, inputs, replay, tick),
    [live, circuit, inputs, replay, tick],
  );

  const geomOf = useMemo(() => createGeometryLookup(resolve, displayName), [resolve, displayName]);

  // Camera: fit the circuit once the canvas has a size.
  const [camera, setCamera] = useState<Camera>({ x: -4, y: -4, zoom: 1 });
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const fitted = useRef(false);
  /** Fits every part into a viewport of the given size. */
  const fitTo = useCallback(
    (size: Size) => {
      const rects = store.getState().circuit.components.flatMap((c) => {
        const g = geomOf(c.kind);
        return g ? [partRect(c, g)] : [];
      });
      if (rects.length === 0 || size.width === 0) return;
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
  const onSizeChange = useCallback(
    (size: Size) => {
      setViewport(size);
      if (fitted.current || size.width === 0) return;
      fitted.current = true;
      fitTo(size);
    },
    [fitTo],
  );

  // Interaction mode: a ref for handlers, state for rendering previews.
  const modeRef = useRef<Mode>(IDLE);
  const [mode, setMode] = useState<Mode>(IDLE);
  const [toast, showToast] = useToast();
  const [helpOpen, setHelpOpen] = useState(false);
  // The key handler is registered once; it reaches the latest fit through this ref.
  const fitRef = useRef(() => {});
  useEffect(() => {
    fitRef.current = () => fitTo(viewport);
  });

  const context = (): InteractionContext => ({
    selection: store.getState().selection,
    partsInRect: (rect) =>
      store.getState().circuit.components.flatMap((c) => {
        const g = geomOf(c.kind);
        return g && rectsIntersect(partRect(c, g), rect) ? [c.id] : [];
      }),
    nearestPin: (world, dir) => {
      let best: { end: PinEnd; distance: number } | undefined;
      for (const c of store.getState().circuit.components) {
        const g = geomOf(c.kind);
        if (!g) continue;
        for (const pin of g.pins) {
          if (pin.dir !== dir) continue;
          const at = pinWorld(c, g, pin);
          const distance = Math.hypot(at.x - world.x, at.y - world.y);
          if (distance <= SNAP_DISTANCE && (!best || distance < best.distance)) {
            best = { end: { ref: { comp: c.id, pin: pin.name }, dir }, distance };
          }
        }
      }
      return best?.end;
    },
    wiresBetween: (ids) => {
      const chosen = new Set(ids);
      return store
        .getState()
        .circuit.wires.filter((w) => chosen.has(w.from.comp) && chosen.has(w.to.comp))
        .map((w) => w.id);
    },
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
        case 'moveParts':
          s.moveParts(effect.ids, effect.delta);
          break;
        case 'cancelGesture':
          s.cancelGesture();
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
      const action = shortcutFor(e);
      if (!action) return;
      const s = store.getState();
      const idle = modeRef.current.kind === 'idle';
      if (action.type === 'cancel') {
        if (!idle) {
          const [next, effects] = cancel(modeRef.current);
          modeRef.current = next;
          setMode(next);
          apply(effects);
        }
        setHelpOpen(false);
        return;
      }
      // Always claim our shortcuts (e.g. so ⌘D never opens the bookmark dialog)...
      e.preventDefault();
      // ...but don't edit mid-gesture.
      if (!idle) return;
      switch (action.type) {
        case 'delete':
          s.deleteSelection();
          break;
        case 'undo':
          s.undo();
          break;
        case 'redo':
          s.redo();
          break;
        case 'duplicate': {
          // Put the copies just below the originals, clear of them.
          const rects = s.circuit.components.flatMap((c) => {
            const g = s.selection.components.includes(c.id) ? geomOf(c.kind) : undefined;
            return g ? [partRect(c, g)] : [];
          });
          const top = Math.min(...rects.map((r) => r.y));
          const bottom = Math.max(...rects.map((r) => r.y + r.height));
          s.duplicateSelection(rects.length > 0 ? { x: 0, y: bottom - top + 2 } : undefined);
          break;
        }
        case 'rotate':
          s.rotateSelection();
          break;
        case 'selectAll':
          s.select({
            components: s.circuit.components.map((c) => c.id),
            wires: s.circuit.wires.map((w) => w.id),
          });
          break;
        case 'help':
          setHelpOpen((open) => !open);
          break;
        case 'fit':
          fitRef.current();
          break;
        case 'toggleInput': {
          const name = s.circuit.components.filter((c) => c.kind === 'in')[action.index]?.label;
          if (name) s.toggleInput(name);
          break;
        }
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

  const wires = useMemo(() => {
    const requests: WireRequest[] = circuit.wires.flatMap((w) => {
      const from = pinAnchor(w.from.comp, w.from.pin, 'out');
      const to = pinAnchor(w.to.comp, w.to.pin, 'in');
      if (!from || !to) return [];
      return [
        {
          id: w.id,
          source: `${w.from.comp}|${w.from.pin}`,
          target: `${w.to.comp}|${w.to.pin}`,
          start: from.at,
          startDir: from.facing,
          end: to.at,
          endDir: to.facing,
        },
      ];
    });
    const obstacles = circuit.components.flatMap((c) => {
      const g = geomOf(c.kind);
      return g ? [partRect(c, g)] : [];
    });
    const routes = routeWires(requests, obstacles);
    return circuit.wires.flatMap((wire) => {
      const points = routes.get(wire.id);
      return points ? [{ wire, points }] : [];
    });
  }, [circuit.wires, circuit.components, pinAnchor, geomOf]);

  // Junction dots where a signal visibly branches (fan-out) or joined relay outputs merge.
  const junctions = useMemo(() => {
    const dots: { key: string; at: Point; comp: string; pin: string }[] = [];
    const groups = (end: 'from' | 'to') => {
      const byPin = new Map<string, Point[][]>();
      for (const { wire, points } of wires) {
        const ref = wire[end];
        const key = `${ref.comp}|${ref.pin}`;
        const route = end === 'from' ? points : [...points].reverse();
        byPin.set(key, [...(byPin.get(key) ?? []), route]);
      }
      for (const [key, routes] of byPin) {
        const [comp = '', pin = ''] = key.split('|');
        routes.forEach((route, i) => {
          if (i === 0) return;
          let best = branchPoint(routes[0]!, route);
          for (const earlier of routes.slice(1, i)) {
            const candidate = branchPoint(earlier, route);
            if (candidate.distance > best.distance) best = candidate;
          }
          if (best.distance === 0) {
            // Splitting right at the pin: only joins need a dot (the pin shows a fan-out).
            if (end === 'from') return;
          }
          dots.push({ key: `${end}:${key}:${i}`, at: best.at, comp, pin });
        });
      }
    };
    groups('from');
    groups('to');
    return dots;
  }, [wires]);

  const preview = useMemo(() => {
    if (mode.kind !== 'wiring') return null;
    const from = pinAnchor(mode.from.ref.comp, mode.from.ref.pin, mode.from.dir);
    if (!from) return null;
    const target =
      mode.target && pinAnchor(mode.target.ref.comp, mode.target.ref.pin, mode.target.dir);
    const end = target?.at ?? mode.cursor;
    const endFacing = target?.facing ?? { x: 0, y: 0 };
    const route =
      mode.from.dir === 'out'
        ? routeWire(from.at, from.facing, end, endFacing)
        : routeWire(end, endFacing, from.at, from.facing);
    return polylinePath(route);
  }, [mode, pinAnchor]);
  const box = mode.kind === 'boxSelecting' ? normalizeRect(mode.start, mode.current) : null;

  // While wiring from an output: inputs that already have a wire (unless joining relays).
  const blocked = useMemo(() => {
    const result = new Map<string, Set<string>>();
    if (mode.kind !== 'wiring' || mode.from.dir !== 'out') return result;
    const isRelay = (comp: string) => {
      const kind = circuit.components.find((c) => c.id === comp)?.kind;
      return !!kind && !!resolve(kind)?.wiredOrOutput;
    };
    const fromRelay = isRelay(mode.from.ref.comp);
    const sources = new Map<string, string[]>();
    for (const w of circuit.wires) {
      const key = `${w.to.comp}|${w.to.pin}`;
      sources.set(key, [...(sources.get(key) ?? []), w.from.comp]);
    }
    for (const [key, from] of sources) {
      if (fromRelay && from.every(isRelay)) continue;
      const [comp = '', pin = ''] = key.split('|');
      result.set(comp, new Set([...(result.get(comp) ?? []), pin]));
    }
    return result;
  }, [mode, circuit, resolve]);

  /**
   * Adds a part centred on a world point, if the toolbox allows it. Clicked parts (`avoid`)
   * move to the nearest free spot; dropped parts land exactly where the player put them.
   */
  const place = (kind: ComponentKind, centre: Point, avoid = false) => {
    const geom = geomOf(kind);
    if (!geom || !toolbox.includes(kind)) return;
    let pos = {
      x: Math.round(centre.x - geom.width / 2),
      y: Math.round(centre.y - geom.height / 2),
    };
    const taken = store.getState().circuit.components.flatMap((c) => {
      const g = geomOf(c.kind);
      return g ? [partRect(c, g)] : [];
    });
    const rect = { ...pos, width: geom.width, height: geom.height };
    // Clicked parts keep a margin; dropped ones stay put unless they'd land on another part.
    if (avoid || taken.some((t) => rectsIntersect(t, rect))) pos = findFreeSpot(rect, taken);
    store.getState().addPart(kind, pos);
  };

  return (
    <div className={styles.editor}>
      <Toolbox
        kinds={toolbox}
        displayName={displayName}
        geomOf={geomOf}
        family={family}
        onAdd={(kind) =>
          place(
            kind,
            screenToWorld({ x: viewport.width / 2, y: viewport.height / 2 }, camera),
            true,
          )
        }
      />
      <Canvas
        camera={camera}
        onCameraChange={setCamera}
        onSizeChange={onSizeChange}
        label={label}
        onPointerDown={(e) => {
          if (e.event.button !== 0) return;
          setHelpOpen(false);
          e.event.currentTarget.setPointerCapture(e.event.pointerId);
          run(pointerDown(modeRef.current, toInput(e), context()));
        }}
        onPointerMove={(e) => {
          if (modeRef.current.kind === 'idle') return;
          run(pointerMove(modeRef.current, toInput(e), context()));
        }}
        onPointerUp={(e) => run(pointerUp(modeRef.current, toInput(e), context()))}
        onDropData={(data, world) => {
          const kind = data.getData(KIND_MIME) as ComponentKind;
          if (kind) place(kind, world);
        }}
        overlay={
          <>
            <StatusBadge snapshot={snapshot} />
            {replay?.label && replay.inputs === inputs && replay.circuit === circuit && (
              <div className={styles.scrub} role="status">
                <span>
                  Showing <strong>{replay.label}</strong>, as the test saw it
                </span>
                <button type="button" onClick={() => store.setState({ inputs: { ...inputs } })}>
                  Back to live
                </button>
              </div>
            )}
            <TickControls
              on={tick.mode}
              ticks={snapshot.ticking?.ticks ?? 0}
              settled={snapshot.ticking?.settled ?? true}
              onToggle={() => store.getState().setTickMode(!tick.mode)}
              onNext={() => store.getState().nextTick()}
            />
            <HelpPanel
              open={helpOpen}
              onToggle={() => setHelpOpen((open) => !open)}
              onFit={() => fitTo(viewport)}
            />
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
          data-wiring={
            mode.kind === 'wiring' ? (mode.from.dir === 'out' ? 'in' : 'out') : undefined
          }
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
                pending={snapshot.ticking?.pendingParts.has(part.id)}
                blockedPins={blocked.get(part.id)}
                family={family?.(part.kind)}
                targetPin={
                  mode.kind === 'wiring' && mode.target?.ref.comp === part.id
                    ? mode.target.ref.pin
                    : undefined
                }
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
    </div>
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
