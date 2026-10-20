import type { ReactNode } from 'react';
import { Suspense, lazy } from 'react';
import { useSaveNotice } from '../../state/persist.ts';
import type { Route } from '../../app/router.ts';
import { routeHref } from '../../app/router.ts';
import styles from './AppShell.module.css';

/** Developer tools: a lazily loaded chunk that only exists in development builds. */
const DevTools = import.meta.env.DEV ? lazy(() => import('../dev/DevTools.tsx')) : null;

const NAV = [
  { route: { name: 'map' }, label: 'Map' },
  { route: { name: 'sandbox' }, label: 'Sandbox' },
  { route: { name: 'settings' }, label: 'Settings' },
] as const;

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const notice = useSaveNotice();
  return (
    <div className={styles.shell}>
      {notice.message && (
        <div className={styles.notice} role="alert">
          <span>{notice.message}</span>
          {notice.action && (
            <button type="button" onClick={notice.action.run}>
              {notice.action.label}
            </button>
          )}
          <button type="button" onClick={notice.dismiss}>
            Dismiss
          </button>
        </div>
      )}
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
        {DevTools && (
          <Suspense fallback={null}>
            <DevTools route={route} />
          </Suspense>
        )}
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
