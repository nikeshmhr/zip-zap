import { AppShell } from '../ui/shell/AppShell.tsx';
import { GalleryScreen } from '../ui/screens/GalleryScreen.tsx';
import { Placeholder } from '../ui/screens/Placeholder.tsx';
import { SandboxScreen } from '../ui/screens/SandboxScreen.tsx';
import { routeHref, useRoute } from './router.ts';

export function App() {
  const route = useRoute();
  return (
    <AppShell route={route}>
      {route.name === 'map' && (
        <Placeholder title="Zip Zap">
          <p>Build a computer from relays up, one chip at a time.</p>
          <p>The level map arrives in milestone M5.</p>
        </Placeholder>
      )}
      {route.name === 'level' && (
        <Placeholder title={`Level ${route.id}`}>
          <p>The level screen arrives in milestone M4.</p>
        </Placeholder>
      )}
      {route.name === 'sandbox' && <SandboxScreen />}
      {route.name === 'settings' && <Placeholder title="Settings" />}
      {route.name === 'gallery' && <GalleryScreen />}
      {route.name === 'notFound' && (
        <Placeholder title="Page not found">
          <p>
            Nothing lives at <code>{route.path}</code>.{' '}
            <a href={routeHref({ name: 'map' })}>Back to the map</a>
          </p>
        </Placeholder>
      )}
    </AppShell>
  );
}
