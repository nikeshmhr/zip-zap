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
 * `lane` shifts the route's middle run sideways so parallel wires don't overlap.
 */
export function routeWire(
  start: Point,
  startDir: Point,
  end: Point,
  endDir: Point,
  lane = 0,
): Point[] {
  const endFacesLeft = endDir.x === -1 || (endDir.x === 0 && endDir.y === 0);
  if (startDir.x === 1 && endFacesLeft && end.x > start.x) {
    // The common case: left to right. One vertical run, kept strictly between the pins.
    const gap = end.x - start.x;
    const midX = start.x + Math.min(gap - 0.5, Math.max(0.5, gap / 2 + lane));
    return simplify([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]);
  }

  // Lanes also lengthen the stubs, so loop-arounds don't share their vertical runs.
  const stub = STUB + Math.abs(lane) * 0.5;
  const s1 = { x: start.x + startDir.x * stub, y: start.y + startDir.y * stub };
  const e1 = { x: end.x + endDir.x * stub, y: end.y + endDir.y * stub };
  let middle: Point[];
  if (s1.x <= e1.x) {
    const midX = (s1.x + e1.x) / 2 + lane;
    middle = [
      { x: midX, y: s1.y },
      { x: midX, y: e1.y },
    ];
  } else {
    // The target is behind the source: loop around above or below.
    const midY =
      (Math.abs(s1.y - e1.y) >= 2 ? (s1.y + e1.y) / 2 : Math.max(start.y, end.y) + 3) + lane;
    middle = [
      { x: s1.x, y: midY },
      { x: e1.x, y: midY },
    ];
  }
  return simplify([start, s1, ...middle, e1, end]);
}

export interface WireRequest {
  id: string;
  /** Wires with the same source are one signal and may share runs. */
  source: string;
  /** Wires into the same input (joined relays) may share runs too. */
  target: string;
  start: Point;
  startDir: Point;
  end: Point;
  endDir: Point;
}

const LANES = [0, 1, -1, 2, -2, 3, -3];

/** Whether two axis-aligned segments run along the same line with some shared length. */
function segmentsOverlap(a0: Point, a1: Point, b0: Point, b1: Point): boolean {
  const horizontal = (p: Point, q: Point) => p.y === q.y && p.x !== q.x;
  const vertical = (p: Point, q: Point) => p.x === q.x && p.y !== q.y;
  const overlap = (p0: number, p1: number, q0: number, q1: number) =>
    Math.min(Math.max(p0, p1), Math.max(q0, q1)) - Math.max(Math.min(p0, p1), Math.min(q0, q1)) > 0;
  if (horizontal(a0, a1) && horizontal(b0, b1) && a0.y === b0.y) {
    return overlap(a0.x, a1.x, b0.x, b1.x);
  }
  if (vertical(a0, a1) && vertical(b0, b1) && a0.x === b0.x) return overlap(a0.y, a1.y, b0.y, b1.y);
  return false;
}

function routesOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (segmentsOverlap(a[i - 1]!, a[i]!, b[j - 1]!, b[j]!)) return true;
    }
  }
  return false;
}

/**
 * Routes several wires, moving each one to the first lane where it doesn't run along a wire
 * carrying a different signal (which would make two signals look joined).
 */
export function routeWires(requests: readonly WireRequest[]): Map<string, Point[]> {
  const placed: { request: WireRequest; points: Point[] }[] = [];
  const routes = new Map<string, Point[]>();
  for (const request of requests) {
    const { start, startDir, end, endDir } = request;
    let chosen: Point[] | null = null;
    for (const lane of LANES) {
      const points = routeWire(start, startDir, end, endDir, lane);
      const clash = placed.some(
        (other) =>
          other.request.source !== request.source &&
          other.request.target !== request.target &&
          routesOverlap(points, other.points),
      );
      if (!clash) {
        chosen = points;
        break;
      }
    }
    chosen ??= routeWire(start, startDir, end, endDir);
    placed.push({ request, points: chosen });
    routes.set(request.id, chosen);
  }
  return routes;
}

const onSegment = (p: Point, a: Point, b: Point) =>
  (a.x === b.x && p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)) ||
  (a.y === b.y && p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x));

const onPolyline = (p: Point, poly: readonly Point[]) =>
  poly.some((q, i) => i > 0 && onSegment(p, poly[i - 1]!, q)) ||
  (poly.length === 1 && poly[0]!.x === p.x && poly[0]!.y === p.y);

/**
 * Two routes that start at the same point: where `b` leaves `a`, and how far along `b` that is.
 * Used to draw junction dots where a signal branches.
 */
export function branchPoint(
  a: readonly Point[],
  b: readonly Point[],
): { at: Point; distance: number } {
  let distance = 0;
  let at = b[0]!;
  for (let i = 1; i < b.length; i++) {
    const from = b[i - 1]!;
    const to = b[i]!;
    const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    if (onPolyline(to, a)) {
      distance += length;
      at = to;
      continue;
    }
    // b leaves a somewhere along this segment: the furthest vertex of a still on it.
    let best = from;
    for (const q of a) {
      if (!onSegment(q, from, to)) continue;
      const d = Math.abs(q.x - from.x) + Math.abs(q.y - from.y);
      if (d > Math.abs(best.x - from.x) + Math.abs(best.y - from.y)) best = q;
    }
    distance += Math.abs(best.x - from.x) + Math.abs(best.y - from.y);
    at = best;
    break;
  }
  return { at, distance };
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
