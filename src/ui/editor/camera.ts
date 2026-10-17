/**
 * World ↔ screen coordinates (plan §6). World space is in grid units; one unit is UNIT
 * pixels at zoom 1. The camera stores the world point shown at the viewport's top-left.
 */
import type { Point } from '../../engine/model.ts';

export const UNIT = 16;
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 3;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const scale = (camera: Camera) => UNIT * camera.zoom;

export const screenToWorld = (p: Point, camera: Camera): Point => ({
  x: camera.x + p.x / scale(camera),
  y: camera.y + p.y / scale(camera),
});

export const worldToScreen = (p: Point, camera: Camera): Point => ({
  x: (p.x - camera.x) * scale(camera),
  y: (p.y - camera.y) * scale(camera),
});

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Zooms by `factor`, keeping the world point under `screenPoint` where it is. */
export function zoomAt(camera: Camera, screenPoint: Point, factor: number): Camera {
  const zoom = clampZoom(camera.zoom * factor);
  const anchor = screenToWorld(screenPoint, camera);
  return {
    zoom,
    x: anchor.x - screenPoint.x / (UNIT * zoom),
    y: anchor.y - screenPoint.y / (UNIT * zoom),
  };
}

/** Moves the view so the content follows a screen-space drag of `delta`. */
export const panBy = (camera: Camera, delta: Point): Camera => ({
  ...camera,
  x: camera.x - delta.x / scale(camera),
  y: camera.y - delta.y / scale(camera),
});

/** A camera that shows `bounds` centred in `viewport` with `padding` grid units around it. */
export function fitCamera(bounds: Bounds, viewport: Size, padding = 4, maxZoom = 1.5): Camera {
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;
  const zoom = clampZoom(
    Math.min(maxZoom, viewport.width / (width * UNIT), viewport.height / (height * UNIT)),
  );
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    zoom,
    x: cx - viewport.width / (2 * UNIT * zoom),
    y: cy - viewport.height / (2 * UNIT * zoom),
  };
}

/** The SVG viewBox (in grid units) for a camera and viewport. */
export const viewBox = (camera: Camera, viewport: Size) =>
  `${camera.x} ${camera.y} ${viewport.width / scale(camera)} ${viewport.height / scale(camera)}`;

export const snap = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });
