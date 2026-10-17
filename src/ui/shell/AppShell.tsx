import type { ReactNode } from 'react';
import type { Route } from '../../app/router.ts';
import { routeHref } from '../../app/router.ts';
import styles from './AppShell.module.css';

const NAV = [
  { route: { name: 'map' }, label: 'Map' },
  { route: { name: 'sandbox' }, label: 'Sandbox' },
  { route: { name: 'settings' }, label: 'Settings' },
] as const;

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.logo} href={routeHref({ name: 'map' })}>
          <span aria-hidden="true" className={styles.mark}>
            ⚡
          </span>
          Zip Zap
        </a>
        <nav className={styles.nav} aria-label="Main">
          {NAV.map(({ route: target, label }) => (
            <a
              key={label}
              href={routeHref(target)}
              aria-current={route.name === target.name ? 'page' : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
