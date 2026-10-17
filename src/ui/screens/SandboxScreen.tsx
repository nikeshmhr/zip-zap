import { useState } from 'react';
import type { Camera } from '../editor/camera.ts';
import { Canvas } from '../editor/Canvas.tsx';

/** Free-build sandbox. For now: an empty canvas (the editor lands over M3). */
export function SandboxScreen() {
  const [camera, setCamera] = useState<Camera>({ x: -4, y: -4, zoom: 1 });
  return <Canvas camera={camera} onCameraChange={setCamera} label="Sandbox circuit" />;
}
