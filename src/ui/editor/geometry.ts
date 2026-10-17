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

export const findPin = (geom: PartGeom, name: string, dir: 'in' | 'out') =>
  geom.pins.find((p) => p.name === name && p.dir === dir);

/** Length of the straight lead a wire runs out of each pin before turning. */
const STUB = 1;

/**
 * An orthogonal route from an output pin to an input pin. `startDir`/`endDir` point away from
 * their parts; an end with no direction (the cursor while wiring) is approached directly.
 */
export function routeWire(start: Point, startDir: Point, end: Point, endDir: Point): Point[] {
  const s1 = { x: start.x + startDir.x * STUB, y: start.y + startDir.y * STUB };
  const e1 = { x: end.x + endDir.x * STUB, y: end.y + endDir.y * STUB };
  let middle: Point[];
  if (s1.x <= e1.x) {
    const midX = (s1.x + e1.x) / 2;
    middle = [
      { x: midX, y: s1.y },
      { x: midX, y: e1.y },
    ];
  } else {
    // The target is behind the source: loop around above or below.
    const midY = Math.abs(s1.y - e1.y) >= 2 ? (s1.y + e1.y) / 2 : Math.max(start.y, end.y) + 3;
    middle = [
      { x: s1.x, y: midY },
      { x: e1.x, y: midY },
    ];
  }
  return simplify([start, s1, ...middle, e1, end]);
}

/** Drops repeated points and points in the middle of straight runs. */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = out.at(-2);
    if (
      prev &&
      last &&
      ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))
    ) {
      out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

export const polylinePath = (points: readonly Point[]) =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');

/**
 * The nearest position to `rect` (searching outwards in whole grid steps) where it doesn't
 * overlap any of `taken`, keeping a one-unit gap.
 */
export function findFreeSpot(rect: Rect, taken: readonly Rect[], maxRadius = 30): Point {
  const padded = (r: Rect): Rect => ({
    x: r.x - 1,
    y: r.y - 1,
    width: r.width + 2,
    height: r.height + 2,
  });
  const fits = (x: number, y: number) =>
    !taken.some((t) => rectsIntersect(padded(t), { ...rect, x, y }));
  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        if (fits(rect.x + dx, rect.y + dy)) return { x: rect.x + dx, y: rect.y + dy };
      }
    }
  }
  return { x: rect.x, y: rect.y };
}
