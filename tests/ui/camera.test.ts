import { describe, expect, it } from 'vitest';
import type { Camera } from '../../src/ui/editor/camera.ts';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  UNIT,
  fitCamera,
  panBy,
  screenToWorld,
  snap,
  viewBox,
  worldToScreen,
  zoomAt,
} from '../../src/ui/editor/camera.ts';

const camera: Camera = { x: -5, y: 10, zoom: 2 };

describe('camera', () => {
  it('converts between screen and world coordinates', () => {
    expect(screenToWorld({ x: 0, y: 0 }, camera)).toEqual({ x: -5, y: 10 });
    expect(screenToWorld({ x: UNIT * 2, y: UNIT * 4 }, camera)).toEqual({ x: -4, y: 12 });
    const p = { x: 123, y: 45 };
    const back = worldToScreen(screenToWorld(p, camera), camera);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('zooms around the cursor, keeping the world point under it fixed', () => {
    const cursor = { x: 300, y: 200 };
    const before = screenToWorld(cursor, camera);
    for (const factor of [1.25, 0.5, 1.1]) {
      const zoomed = zoomAt(camera, cursor, factor);
      const after = screenToWorld(cursor, zoomed);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
    }
  });

  it('clamps zoom', () => {
    expect(zoomAt(camera, { x: 0, y: 0 }, 100).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(camera, { x: 0, y: 0 }, 0.001).zoom).toBe(MIN_ZOOM);
  });

  it('pans so content follows the drag', () => {
    const moved = panBy(camera, { x: UNIT * 2, y: 0 });
    expect(moved).toEqual({ x: -6, y: 10, zoom: 2 });
  });

  it('fits bounds in the middle of the viewport', () => {
    const fitted = fitCamera({ minX: 0, minY: 0, maxX: 40, maxY: 8 }, { width: 960, height: 600 });
    const centre = screenToWorld({ x: 480, y: 300 }, fitted);
    expect(centre.x).toBeCloseTo(20);
    expect(centre.y).toBeCloseTo(4);
    expect(fitted.zoom * UNIT * 48).toBeLessThanOrEqual(960);
  });

  it('builds a viewBox in grid units', () => {
    expect(viewBox({ x: 1, y: 2, zoom: 1 }, { width: UNIT * 10, height: UNIT * 5 })).toBe(
      '1 2 10 5',
    );
  });

  it('snaps to the grid', () => {
    expect(snap({ x: 1.4, y: -2.6 })).toEqual({ x: 1, y: -3 });
  });
});
