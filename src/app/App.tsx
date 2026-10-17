import { LevelScreen } from '../ui/level/LevelScreen.tsx';
import { MapScreen } from '../ui/map/MapScreen.tsx';
import { AppShell } from '../ui/shell/AppShell.tsx';
import { GalleryScreen } from '../ui/screens/GalleryScreen.tsx';
import { Placeholder } from '../ui/screens/Placeholder.tsx';
import { SandboxScreen } from '../ui/screens/SandboxScreen.tsx';
import { routeHref, useRoute } from './router.ts';

export function App() {
  const route = useRoute();
  return (
    <AppShell route={route}>
      {route.name === 'map' && <MapScreen />}
      {route.name === 'level' && <LevelScreen id={route.id} />}
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
