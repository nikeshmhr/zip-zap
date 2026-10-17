/**
 * A tiny hash router (plan §8): works on any static host without server rewrites.
 */
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'map' }
  | { name: 'level'; id: string }
  | { name: 'sandbox' }
  | { name: 'settings' }
  /** Developer page showing every component kind (T3.4). */
  | { name: 'gallery' }
  | { name: 'notFound'; path: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+|\/+$/g, '');
  const [head, ...rest] = path.split('/');
  switch (head) {
    case '':
    case 'map':
      return rest.length === 0 ? { name: 'map' } : { name: 'notFound', path };
    case 'level':
      return rest.length === 1 && rest[0]
        ? { name: 'level', id: decodeURIComponent(rest[0]) }
        : { name: 'notFound', path };
    case 'sandbox':
    case 'settings':
    case 'gallery':
      return rest.length === 0 ? { name: head } : { name: 'notFound', path };
    default:
      return { name: 'notFound', path };
  }
}

export function routeHref(route: Exclude<Route, { name: 'notFound' }>): string {
  return route.name === 'level' ? `#/level/${encodeURIComponent(route.id)}` : `#/${route.name}`;
}

export function navigate(route: Exclude<Route, { name: 'notFound' }>): void {
  window.location.hash = routeHref(route);
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

/** The current route; re-renders on navigation. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}
