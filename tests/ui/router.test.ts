import { describe, expect, it } from 'vitest';
import { parseHash, routeHref } from '../../src/app/router.ts';

describe('parseHash', () => {
  it('defaults to the map', () => {
    expect(parseHash('')).toEqual({ name: 'map' });
    expect(parseHash('#/')).toEqual({ name: 'map' });
    expect(parseHash('#/map')).toEqual({ name: 'map' });
  });

  it('parses level routes, including dotted ids', () => {
    expect(parseHash('#/level/2.3')).toEqual({ name: 'level', id: '2.3' });
  });

  it('parses the other screens and tolerates trailing slashes', () => {
    expect(parseHash('#/sandbox/')).toEqual({ name: 'sandbox' });
    expect(parseHash('#/settings')).toEqual({ name: 'settings' });
    expect(parseHash('#/gallery')).toEqual({ name: 'gallery' });
  });

  it('reports unknown or malformed paths', () => {
    expect(parseHash('#/nope')).toEqual({ name: 'notFound', path: 'nope' });
    expect(parseHash('#/level')).toEqual({ name: 'notFound', path: 'level' });
    expect(parseHash('#/map/extra')).toEqual({ name: 'notFound', path: 'map/extra' });
  });
});

describe('routeHref', () => {
  it('round-trips through parseHash', () => {
    for (const route of [
      { name: 'map' },
      { name: 'level', id: '4.6' },
      { name: 'sandbox' },
      { name: 'settings' },
    ] as const) {
      expect(parseHash(routeHref(route))).toEqual(route);
    }
  });
});
