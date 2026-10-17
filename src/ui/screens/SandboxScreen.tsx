import { useState } from 'react';
import { catalogue } from '../../content/index.ts';
import { addComponent, startCircuit } from '../../state/editing.ts';
import { createEditorStore } from '../../state/editorStore.ts';
import { CircuitEditor } from '../editor/CircuitEditor.tsx';

/** Free-build sandbox. For now a development playground; the real sandbox arrives in T5.6. */
function seedCircuit() {
  let circuit = startCircuit({ inputs: ['A', 'B'], outputs: ['OUT'] });
  circuit = addComponent(circuit, 'nand', { x: 12, y: 0 }).circuit;
  circuit = addComponent(circuit, 'chip:xor', { x: 22, y: 4 }).circuit;
  return circuit;
}

export function SandboxScreen() {
  const [store] = useState(() => createEditorStore(seedCircuit()));
  return (
    <CircuitEditor
      store={store}
      resolve={catalogue.resolve}
      displayName={catalogue.displayName}
      label="Sandbox circuit"
    />
  );
}
