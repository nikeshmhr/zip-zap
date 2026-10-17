/**
 * Part geometry in grid units: size and pin positions for every component kind and rotation.
 * Inputs sit on the left edge and outputs on the right, two units apart, so every pin lands on
 * a whole grid point and wires line up.
 */
import type { ComponentInstance, ComponentKind, Point, Rotation } from '../../engine/model.ts';
import type { ComponentDef } from '../../engine/primitives.ts';

export const PIN_PITCH = 2;

export interface PinGeom {
  name: string;
  dir: 'in' | 'out';
  /** Position relative to the part's top-left corner, before rotation. */
  x: number;
  y: number;
}

export interface PartGeom {
  /** Unrotated size. */
  width: number;
  height: number;
  pins: PinGeom[];
}

const FIXED_WIDTH: Partial<Record<ComponentKind, number>> = {
  nand: 5,
  relayNO: 5,
  relayNC: 5,
  power: 2,
  const0: 2,
  const1: 2,
  in: 3,
  out: 3,
};

const longest = (names: readonly string[]) => Math.max(0, ...names.map((n) => n.length));

/** Size and pins for a part. `name` sizes chip boxes so their title fits. */
export function partGeometry(def: ComponentDef, name = ''): PartGeom {
  const rows = Math.max(def.inputs.length, def.outputs.length, 1);
  const height = rows * PIN_PITCH;
  const width =
    FIXED_WIDTH[def.kind] ??
    Math.max(
      6,
      Math.ceil(name.length * 0.62) + 2,
      Math.ceil((longest(def.inputs) + longest(def.outputs)) * 0.55) + 3,
    );
  const column = (names: readonly string[], dir: 'in' | 'out', x: number): PinGeom[] => {
    const top = (height - names.length * PIN_PITCH) / 2 + PIN_PITCH / 2;
    return names.map((n, i) => ({ name: n, dir, x, y: top + i * PIN_PITCH }));
  };
  return {
    width,
    height,
    pins: [...column(def.inputs, 'in', 0), ...column(def.outputs, 'out', width)],
  };
}

/** Size of the part's bounding box after rotation. */
export const rotatedSize = (geom: PartGeom, rot: Rotation) =>
  rot === 90 || rot === 270
    ? { width: geom.height, height: geom.width }
    : { width: geom.width, height: geom.height };

/** Rotates a local point clockwise, keeping the rotated box's top-left at the origin. */
export function rotateLocal(p: Point, geom: PartGeom, rot: Rotation): Point {
  const { width: w, height: h } = geom;
  switch (rot) {
    case 0:
      return p;
    case 90:
      return { x: h - p.y, y: p.x };
    case 180:
      return { x: w - p.x, y: h - p.y };
    case 270:
      return { x: p.y, y: w - p.x };
  }
}

/** SVG transform that draws an unrotated part at its position and rotation. */
export function partTransform(part: ComponentInstance, geom: PartGeom): string {
  const { x, y } = part.pos;
  switch (part.rot) {
    case 0:
      return `translate(${x} ${y})`;
    case 90:
      return `translate(${x + geom.height} ${y}) rotate(90)`;
    case 180:
      return `translate(${x + geom.width} ${y + geom.height}) rotate(180)`;
    case 270:
      return `translate(${x} ${y + geom.width}) rotate(270)`;
  }
}

/** World position of a pin. */
export function pinWorld(part: ComponentInstance, geom: PartGeom, pin: PinGeom): Point {
  const local = rotateLocal(pin, geom, part.rot);
  return { x: part.pos.x + local.x, y: part.pos.y + local.y };
}

/** Clockwise from right: the four directions a wire can leave a pin. */
const DIRECTIONS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

/** Direction a pin's wire leaves the part, as a unit vector. */
export function pinFacing(part: ComponentInstance, pin: PinGeom): Point {
  const base = pin.dir === 'out' ? 0 : 2;
  return DIRECTIONS[(base + part.rot / 90) % 4]!;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function partRect(part: ComponentInstance, geom: PartGeom): Rect {
  return { ...part.pos, ...rotatedSize(geom, part.rot) };
}

export const rectsIntersect = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Memoised geometry lookup per component kind. Returns undefined for unknown kinds. */
export function createGeometryLookup(
  resolve: (kind: ComponentKind) => ComponentDef | undefined,
  displayName: (kind: ComponentKind) => string,
): (kind: ComponentKind) => PartGeom | undefined {
  const cache = new Map<ComponentKind, PartGeom>();
  return (kind) => {
    let geom = cache.get(kind);
    if (!geom) {
      const def = resolve(kind);
      if (!def) return undefined;
      geom = partGeometry(def, displayName(kind));
      cache.set(kind, geom);
    }
    return geom;
  };
}
