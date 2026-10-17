/**
 * The sandbox (spec §9): free building with the basic parts, every unlocked chip, and as many
 * switches and lamps as you like. Saved like any level.
 */
import { useMemo, useState } from 'react';
import { catalogue } from '../../content/index.ts';
import type { ChipKind, ComponentKind } from '../../engine/model.ts';
import { ChipViewer } from '../level/ChipViewer.tsx';
import { startCircuit } from '../../state/editing.ts';
import { levelEditor, useProgress } from '../../state/session.ts';
import { unlockedKinds } from '../../state/unlocks.ts';
import { chipFamily } from '../chipFamily.ts';
import { CircuitEditor } from '../editor/CircuitEditor.tsx';
import styles from './SandboxScreen.module.css';

const SANDBOX_START = { inputs: ['A', 'B'], outputs: ['OUT'] };
const BASICS: ComponentKind[] = ['in', 'out', 'power', 'const0', 'const1', 'relayNO', 'relayNC'];

export function SandboxScreen() {
  const store = useMemo(() => levelEditor('sandbox', SANDBOX_START, false), []);
  const levels = useProgress((s) => s.levels);
  const toolbox = useMemo(
    () => [...BASICS, ...unlockedKinds(catalogue.levels, (id) => !!levels[id]?.solved)],
    [levels],
  );
  const chips = toolbox.filter((k) => k.startsWith('chip:')).length;
  const [chipPath, setChipPath] = useState<readonly ChipKind[]>([]);

  return (
    <div className={styles.sandbox}>
      <header className={styles.header}>
        <div>
          <h1>Sandbox</h1>
          <p>
            Build anything. Add your own switches and lamps;{' '}
            {chips === 0
              ? 'chips you unlock in the levels appear here too'
              : `${chips} unlocked ${chips === 1 ? 'chip is' : 'chips are'} in the toolbox`}
            .
          </p>
        </div>
        <button
          type="button"
          className={styles.clear}
          onClick={() => store.getState().commit(() => startCircuit(SANDBOX_START))}
        >
          Clear
        </button>
      </header>
      <CircuitEditor
        store={store}
        resolve={catalogue.resolve}
        displayName={catalogue.displayName}
        label="Sandbox circuit"
        family={chipFamily}
        onOpenChip={(kind) => setChipPath([kind])}
        toolbox={toolbox}
      />
      <ChipViewer path={chipPath} onPathChange={setChipPath} />
    </div>
  );
}
