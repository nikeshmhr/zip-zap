import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import './app/global.css';
import { startUp } from './app/startup.ts';

if (import.meta.env.DEV) {
  void import('./app/devHooks.ts').then((m) => m.installDevHooks());
}

startUp();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
