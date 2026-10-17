/**
 * Developer page: every component kind, OFF on the top row and ON below (T3.4).
 */
import { useMemo, useRef, useState } from 'react';
import { catalogue } from '../../content/index.ts';
import type { Bit, ComponentInstance, ComponentKind } from '../../engine/model.ts';
import { chipKind } from '../../engine/model.ts';
import { Canvas } from '../editor/Canvas.tsx';
import type { Camera } from '../editor/camera.ts';
import { fitCamera } from '../editor/camera.ts';
import { partGeometry } from '../editor/geometry.ts';
import { PartView } from '../editor/PartView.tsx';

const KINDS: ComponentKind[] = [
  'in',
  'out',
  'power',
  'const0',
  'const1',
  'relayNO',
  'relayNC',
  'nand',
  ...catalogue.chips.map((c) => chipKind(c.id)),
];

const ROW_WIDTH = 150;

export function GalleryScreen() {
  const layout = useMemo(() => {
    const items: { part: ComponentInstance; name: string; on: boolean }[] = [];
    let x = 2;
    let y = 2;
    let rowHeight = 0;
    for (const kind of KINDS) {
      const def = catalogue.resolve(kind)!;
      const name = catalogue.displayName(kind);
      const geom = partGeometry(def, name);
      if (x + geom.width > ROW_WIDTH) {
        x = 2;
        y += rowHeight * 2 + 8;
        rowHeight = 0;
      }
      for (const on of [false, true]) {
        items.push({
          part: {
            id: `${kind}-${on}`,
            kind,
            pos: { x, y: on ? y + geom.height + 3 : y },
            rot: 0,
            label: 'A',
          },
          name,
          on,
        });
      }
      rowHeight = Math.max(rowHeight, geom.height);
      x += geom.width + 6;
    }
    return { items, height: y + rowHeight * 2 + 6 };
  }, []);

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const fitted = useRef(false);
  const bounds = { minX: 0, minY: 0, maxX: ROW_WIDTH, maxY: layout.height };

  return (
    <Canvas
      camera={camera}
      onCameraChange={setCamera}
      onSizeChange={(size) => {
        if (fitted.current || size.width === 0) return;
        fitted.current = true;
        setCamera(fitCamera(bounds, size, 2));
      }}
      label="Component gallery"
    >
      {layout.items.map(({ part, name, on }) => {
        const def = catalogue.resolve(part.kind)!;
        const values: Record<string, Bit> = {};
        if (on) for (const pin of [...def.inputs, ...def.outputs]) values[pin] = 1;
        return (
          <PartView
            key={part.id}
            part={part}
            geom={partGeometry(def, name)}
            name={name}
            values={values}
          />
        );
      })}
    </Canvas>
  );
}
