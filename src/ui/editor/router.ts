/**
 * Obstacle-avoiding wire router (T7.8): A* search on the grid for each wire, with costs that
 * keep wires out of parts, away from other signals' runs and corners, and low on bends.
 * Wires of the same signal (same source, or joined into the same input) may share paths.
 * Each search runs in a window around its wire; if that finds nothing, a wider one, and
 * finally the simple lane router.
 */
import type { Point } from '../../engine/model.ts';
import type { Rect, WireRequest } from './geometry.ts';
import { routeWire, simplify } from './geometry.ts';

/** Costs, in grid steps. */
const COST = {
  step: 1,
  bend: 3,
  /** Running along another signal's wire: reads as joined. */
  alongOther: 400,
  /** A corner of another signal's wire: reads as a T-junction. */
  touchOther: 120,
  /** Crossing another signal at right angles: fine, but prefer fewer. */
  cross: 2,
  /** Hugging a part's outline. */
  edge: 1,
};

const WINDOW_MARGINS = [6, 14];
const HEURISTIC_WEIGHT = 1.5;
const MAX_EXPANSIONS = 60_000;

// Directions: 0 right, 1 down, 2 left, 3 up.
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

const dirOf = (p: Point) => (p.x > 0 ? 0 : p.y > 0 ? 1 : p.x < 0 ? 2 : 3);

/** A binary min-heap of state indices keyed by f-cost. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.items.length;
  }
  clear() {
    this.items.length = 0;
    this.keys.length = 0;
  }
  push(item: number, key: number) {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent]! <= key) break;
      items[i] = items[parent]!;
      keys[i] = keys[parent]!;
      i = parent;
    }
    items[i] = item;
    keys[i] = key;
  }
  pop(): number {
    const { items, keys } = this;
    const top = items[0]!;
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    if (items.length > 0) {
      let i = 0;
      const n = items.length;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && keys[child + 1]! < keys[child]!) child++;
        if (keys[child]! >= lastKey) break;
        items[i] = items[child]!;
        keys[i] = keys[child]!;
        i = child;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

interface Grid {
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** 1 inside a part, 2 on a part's outline. */
  solid: Uint8Array;
  /** Signal id + 1 running horizontally / vertically through each cell; -1 if several. */
  horizontal: Int32Array;
  vertical: Int32Array;
  /** Signal id + 1 with a corner or end at each cell; -1 if several. */
  corner: Int32Array;
}

function makeGrid(
  requests: readonly WireRequest[],
  obstacles: readonly Rect[],
  extra: readonly Point[] = [],
): Grid {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const r of requests) {
    grow(r.start.x, r.start.y);
    grow(r.end.x, r.end.y);
  }
  for (const o of obstacles) {
    grow(o.x, o.y);
    grow(o.x + o.width, o.y + o.height);
  }
  for (const p of extra) grow(p.x, p.y);
  const margin = WINDOW_MARGINS.at(-1)!;
  const x0 = Math.floor(minX) - margin;
  const y0 = Math.floor(minY) - margin;
  const w = Math.ceil(maxX) - x0 + margin + 1;
  const h = Math.ceil(maxY) - y0 + margin + 1;
  const solid = new Uint8Array(w * h);
  for (const o of obstacles) {
    for (let y = Math.ceil(o.y); y <= Math.floor(o.y + o.height); y++) {
      for (let x = Math.ceil(o.x); x <= Math.floor(o.x + o.width); x++) {
        const inside = x > o.x && x < o.x + o.width && y > o.y && y < o.y + o.height;
        const i = (y - y0) * w + (x - x0);
        if (inside) solid[i] = 1;
        else if (solid[i] === 0) solid[i] = 2;
      }
    }
  }
  // Pins, and the cell just outside each, stay open even where parts overlap.
  for (const r of requests) {
    for (const [p, d] of [
      [r.start, r.startDir],
      [r.end, r.endDir],
    ] as const) {
      for (const q of [p, { x: p.x + d.x, y: p.y + d.y }]) {
        if (Number.isInteger(q.x) && Number.isInteger(q.y)) solid[(q.y - y0) * w + (q.x - x0)] = 0;
      }
    }
  }
  return {
    x0,
    y0,
    w,
    h,
    solid,
    horizontal: new Int32Array(w * h),
    vertical: new Int32Array(w * h),
    corner: new Int32Array(w * h),
  };
}

const mark = (cells: Int32Array, i: number, signal: number) => {
  const current = cells[i]!;
  cells[i] = current === 0 || current === signal ? signal : -1;
};

/** Records a routed wire so later wires keep clear of it. */
function occupy(grid: Grid, points: readonly Point[], signal: number) {
  const { x0, y0, w } = grid;
  const at = (x: number, y: number) => (y - y0) * w + (x - x0);
  points.forEach((p, k) => {
    mark(grid.corner, at(p.x, p.y), signal);
    const next = points[k + 1];
    if (!next) return;
    if (p.y === next.y) {
      for (let x = Math.min(p.x, next.x); x <= Math.max(p.x, next.x); x++) {
        mark(grid.horizontal, at(x, p.y), signal);
      }
    } else {
      for (let y = Math.min(p.y, next.y); y <= Math.max(p.y, next.y); y++) {
        mark(grid.vertical, at(p.x, y), signal);
      }
    }
  });
}

/** Scratch buffers reused across searches (sized to the grid). */
interface Scratch {
  cost: Float64Array;
  parent: Int32Array;
  touched: number[];
  heap: Heap;
  stats?: RouterStats;
}

/** Optional counters, for benchmarks. */
export interface RouterStats {
  searches: number;
  expansions: number;
  /** Wires that needed the wider window, and that fell back to the lane router. */
  widened: number;
  fallbacks: number;
}

function search(
  grid: Grid,
  request: WireRequest,
  signal: number,
  margin: number,
  scratch: Scratch,
): Point[] | null {
  const { x0, y0, w, h, solid, horizontal, vertical, corner } = grid;
  const { start, end, startDir, endDir } = request;
  if (![start.x, start.y, end.x, end.y].every(Number.isInteger)) return null;

  const left = Math.max(x0, Math.min(start.x, end.x) - margin);
  const right = Math.min(x0 + w - 1, Math.max(start.x, end.x) + margin);
  const top = Math.max(y0, Math.min(start.y, end.y) - margin);
  const bottom = Math.min(y0 + h - 1, Math.max(start.y, end.y) + margin);

  const cell = (x: number, y: number) => (y - y0) * w + (x - x0);
  const state = (c: number, d: number) => c * 4 + d;
  const { cost, parent, touched, heap } = scratch;
  for (const s of touched) {
    cost[s] = Infinity;
    parent[s] = -1;
  }
  touched.length = 0;
  heap.clear();

  const goalCell = cell(end.x, end.y);
  const enterDir = (dirOf(endDir) + 2) % 4; // the last move must head into the pin
  const isMine = (occupant: number) => occupant === 0 || occupant === signal;
  // Weighted A*: a slightly greedy estimate finds near-best routes much faster.
  const heuristic = (x: number, y: number) =>
    HEURISTIC_WEIGHT * (Math.abs(x - end.x) + Math.abs(y - end.y));

  // Leave the start pin in its facing direction.
  const d0 = dirOf(startDir);
  const sx = start.x + DX[d0]!;
  const sy = start.y + DY[d0]!;
  if (sx < left || sx > right || sy < top || sy > bottom) return null;
  const s0 = state(cell(sx, sy), d0);
  cost[s0] = COST.step;
  parent[s0] = -2; // previous is the start pin itself
  touched.push(s0);
  heap.push(s0, COST.step + heuristic(sx, sy));

  let expansions = 0;
  if (scratch.stats) scratch.stats.searches++;
  while (heap.size > 0 && expansions++ < MAX_EXPANSIONS) {
    if (scratch.stats) scratch.stats.expansions++;
    const s = heap.pop();
    const c = s >> 2;
    const d = s & 3;
    const x = (c % w) + x0;
    const y = Math.floor(c / w) + y0;
    const g = cost[s]!;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue; // no U-turns
      const nx = x + DX[nd]!;
      const ny = y + DY[nd]!;
      if (nx < left || nx > right || ny < top || ny > bottom) continue;
      const nc = cell(nx, ny);
      if (nc === goalCell) {
        if (nd !== enterDir) continue;
        // Found it: walk back through parents.
        const points: Point[] = [end, { x, y }];
        let back = s;
        while (parent[back]! >= 0) {
          back = parent[back]!;
          const bc = back >> 2;
          points.push({ x: (bc % w) + x0, y: Math.floor(bc / w) + y0 });
        }
        points.push(start);
        return simplify(points.reverse());
      }
      if (solid[nc] === 1) continue;
      let step = COST.step + (nd !== d ? COST.bend : 0);
      if (solid[nc] === 2) step += COST.edge;
      const along = nd % 2 === 0 ? horizontal[nc]! : vertical[nc]!;
      const across = nd % 2 === 0 ? vertical[nc]! : horizontal[nc]!;
      if (!isMine(along)) step += COST.alongOther;
      else if (!isMine(across)) step += COST.cross;
      if (!isMine(corner[nc]!)) step += COST.touchOther;
      const ns = state(nc, nd);
      const ng = g + step;
      if (ng < cost[ns]!) {
        if (cost[ns] === Infinity) touched.push(ns);
        cost[ns] = ng;
        parent[ns] = s;
        heap.push(ns, ng + heuristic(nx, ny));
      }
    }
  }
  return null;
}

/**
 * Routes every wire around the obstacles (part outlines). Shorter wires go first so the
 * common, simple connections get the straightest paths.
 */
/** A wire whose route is already fixed (shaped by the player): others keep clear of it. */
export interface FixedRoute extends WireRequest {
  points: readonly Point[];
}

export function routeAround(
  requests: readonly WireRequest[],
  obstacles: readonly Rect[],
  stats?: RouterStats,
  fixed: readonly FixedRoute[] = [],
): Map<string, Point[]> {
  const routes = new Map<string, Point[]>();
  if (requests.length === 0 && fixed.length === 0) return routes;
  const everyone = [...requests, ...fixed];
  const grid = makeGrid(
    everyone,
    obstacles,
    fixed.flatMap((f) => f.points.filter((p) => Number.isInteger(p.x) && Number.isInteger(p.y))),
  );
  const size = grid.w * grid.h * 4;
  const scratch: Scratch = {
    cost: new Float64Array(size).fill(Infinity),
    parent: new Int32Array(size).fill(-1),
    touched: [],
    heap: new Heap(),
    stats,
  };

  // One signal per connected net: wires sharing a source, or joined into one input.
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    while (parent.get(k) !== k) k = parent.get(k)!;
    return k;
  };
  for (const r of everyone) {
    for (const k of [`from:${r.source}`, `to:${r.target}`]) if (!parent.has(k)) parent.set(k, k);
    parent.set(find(`from:${r.source}`), find(`to:${r.target}`));
  }
  const ids = new Map<string, number>();
  const signalOf = (r: WireRequest) => {
    const root = find(`from:${r.source}`);
    let id = ids.get(root);
    if (id === undefined) ids.set(root, (id = ids.size + 1));
    return id;
  };

  // Player-shaped wires are fixed: record them first.
  for (const f of fixed) {
    if (f.points.every((p) => Number.isInteger(p.x) && Number.isInteger(p.y))) {
      occupy(grid, f.points, signalOf(f));
    }
    routes.set(f.id, [...f.points]);
  }

  // Reserve every pin and the cell just outside it for its own signal first: those cells are
  // the only way in or out, so no other wire may claim them.
  for (const r of everyone) {
    const signal = signalOf(r);
    for (const [p, d] of [
      [r.start, r.startDir],
      [r.end, r.endDir],
    ] as const) {
      const outside = { x: p.x + d.x, y: p.y + d.y };
      if ([p.x, p.y, outside.x, outside.y].every(Number.isInteger))
        occupy(grid, [p, outside], signal);
    }
  }

  const ordered = [...requests].sort(
    (a, b) =>
      Math.abs(a.start.x - a.end.x) +
      Math.abs(a.start.y - a.end.y) -
      (Math.abs(b.start.x - b.end.x) + Math.abs(b.start.y - b.end.y)),
  );
  for (const request of ordered) {
    const signal = signalOf(request);
    let points: Point[] | null = null;
    for (const [i, margin] of WINDOW_MARGINS.entries()) {
      points = search(grid, request, signal, margin, scratch);
      if (points) break;
      if (stats && i === 0) stats.widened++;
    }
    if (!points && stats) stats.fallbacks++;
    points ??= routeWire(request.start, request.startDir, request.end, request.endDir);
    occupy(grid, points, signal);
    routes.set(request.id, points);
  }
  return routes;
}
