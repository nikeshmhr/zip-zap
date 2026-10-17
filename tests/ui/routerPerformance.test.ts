import { describe, expect, it } from 'vitest';
import { catalogue } from '../../src/content/index.ts';
import { createGeometryLookup } from '../../src/ui/editor/geometry.ts';
import { routeAround } from '../../src/ui/editor/router.ts';
import { wireRequests } from '../../src/ui/editor/wireRequests.ts';

/** T7.8 done-when: routing a Tiny RAM-sized circuit stays under 16 ms per edit. */
describe('router performance', () => {
  it('routes the Tiny RAM reference circuit within a frame', () => {
    const geomOf = createGeometryLookup(catalogue.resolve, catalogue.displayName);
    const circuit = catalogue.referenceCircuit('4.6');
    const { requests, obstacles } = wireRequests(circuit, geomOf);
    expect(requests.length).toBeGreaterThan(40);
    routeAround(requests, obstacles); // warm up
    // Best of several runs: the suite runs tests in parallel, which adds noise.
    let ms = Infinity;
    for (let i = 0; i < 7; i++) {
      const start = performance.now();
      routeAround(requests, obstacles);
      ms = Math.min(ms, performance.now() - start);
    }
    const stats = { searches: 0, expansions: 0, widened: 0, fallbacks: 0 };
    routeAround(requests, obstacles, stats);
    console.log(`Tiny RAM: ${requests.length} wires routed in ${ms.toFixed(1)} ms`, stats);
    expect(ms).toBeLessThan(16);
  });
});
