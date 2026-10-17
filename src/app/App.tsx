import { catalogue } from '../content/index.ts';
import { LevelScreen } from '../ui/level/LevelScreen.tsx';
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
          <p>The real level map arrives in milestone M5. For now, every level:</p>
          {catalogue.chapters.map((chapter) => (
            <p key={chapter.id}>
              <strong>{chapter.title}: </strong>
              {catalogue.levels
                .filter((l) => l.chapter === chapter.id)
                .map((l) => (
                  <a
                    key={l.id}
                    href={routeHref({ name: 'level', id: l.id })}
                    style={{ marginRight: 12 }}
                  >
                    {l.id} {l.title}
                  </a>
                ))}
            </p>
          ))}
        </Placeholder>
      )}
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
