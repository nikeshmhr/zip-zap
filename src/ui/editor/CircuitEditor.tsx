/**
 * The circuit editor: canvas, parts, wires, selection and pointer interaction (plan §6).
 * Editing goes through the editor store; pointer logic lives in interaction.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { ComponentKind } from '../../engine/model.ts';
import type { ComponentResolver } from '../../engine/primitives.ts';
import type { EditorStore } from '../../state/editorStore.ts';
import type { Camera, Size } from './camera.ts';
import { fitCamera } from './camera.ts';
import type { CanvasPointerEvent } from './Canvas.tsx';
import { Canvas } from './Canvas.tsx';
import { createGeometryLookup, partRect, rectsIntersect } from './geometry.ts';
import { hitTest } from './hitTest.ts';
import type { Effect, InteractionContext, Mode, PointerInput } from './interaction.ts';
import { IDLE, cancel, normalizeRect, pointerDown, pointerMove, pointerUp } from './interaction.ts';
import { PartView } from './PartView.tsx';
import styles from './CircuitEditor.module.css';

export interface CircuitEditorProps {
  store: EditorStore;
  resolve: ComponentResolver;
  displayName(kind: ComponentKind): string;
  label: string;
}

export function CircuitEditor({ store, resolve, displayName, label }: CircuitEditorProps) {
  const circuit = useStore(store, (s) => s.circuit);
  const selection = useStore(store, (s) => s.selection);

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
        case 'connect':
          // Wiring rules land with T3.6.
          break;
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
      if (e.key === 'Escape' && modeRef.current.kind !== 'idle') {
        const [next, effects] = cancel(modeRef.current);
        modeRef.current = next;
        setMode(next);
        apply(effects);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // apply only reads the store, which is stable for this editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(() => new Set(selection.components), [selection.components]);
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
            selected={selected.has(part.id)}
          />
        );
      })}
      {box && <rect className={styles.box} {...box} />}
    </Canvas>
  );
}
