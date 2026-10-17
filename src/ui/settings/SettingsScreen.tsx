/**
 * Settings (plan §8): theme, motion and sound, plus export, import and reset of the save.
 */
import { useRef, useState } from 'react';
import { replaceSaveAndReload } from '../../app/startup.ts';
import type { Save } from '../../persistence/save.ts';
import { emptySave, exportFileName, exportSave, importSave } from '../../persistence/save.ts';
import { collectSave } from '../../state/persist.ts';
import { useSettings } from '../../state/settings.ts';
import { Modal } from '../components/Modal.tsx';
import styles from './SettingsScreen.module.css';

type Pending = { kind: 'import'; save: Save; fileName: string } | { kind: 'reset' } | null;

function Choice<T extends string>(props: {
  legend: string;
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
}) {
  return (
    <fieldset className={styles.choice}>
      <legend>{props.legend}</legend>
      <div className={styles.options}>
        {props.options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name={props.name}
              value={option.value}
              checked={props.value === option.value}
              onChange={() => props.onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const solvedIn = (save: Save) => Object.values(save.progress).filter((p) => p.solved).length;

export function SettingsScreen() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const download = () => {
    const blob = new Blob([exportSave(collectSave())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName();
    link.click();
    URL.revokeObjectURL(url);
  };

  const readFile = async (file: File) => {
    const result = importSave(await file.text());
    if (!result.ok) setMessage(result.message);
    else {
      setMessage(null);
      setPending({ kind: 'import', save: result.save, fileName: file.name });
    }
  };

  const confirm = () => {
    if (!pending) return;
    const save = pending.kind === 'import' ? pending.save : { ...emptySave(), settings };
    if (!replaceSaveAndReload(save)) {
      setMessage("Your browser didn't let Zip Zap save. Nothing was changed.");
      setPending(null);
    }
  };

  return (
    <div className={styles.settings}>
      <h1>Settings</h1>

      <section className={styles.section} aria-labelledby="appearance">
        <h2 id="appearance">Appearance</h2>
        <Choice
          legend="Theme"
          name="theme"
          value={settings.theme}
          options={[
            { value: 'system', label: 'Match my system' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(theme) => update({ theme })}
        />
        <Choice
          legend="Motion"
          name="motion"
          value={settings.motion}
          options={[
            { value: 'system', label: 'Match my system' },
            { value: 'reduce', label: 'Reduce motion' },
          ]}
          onChange={(motion) => update({ motion })}
        />
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.sound}
            onChange={(e) => update({ sound: e.target.checked })}
          />
          Sound effects
        </label>
      </section>

      <section className={styles.section} aria-labelledby="save">
        <h2 id="save">Your save</h2>
        <p className={styles.note}>
          Progress is saved in this browser automatically. Export a copy to back it up or to move it
          to another browser.
        </p>
        <div className={styles.buttons}>
          <button type="button" onClick={download}>
            Export save
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import save…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Save file to import"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void readFile(file);
            }}
          />
          <button
            type="button"
            className={styles.danger}
            onClick={() => setPending({ kind: 'reset' })}
          >
            Reset progress…
          </button>
        </div>
        {message && (
          <p className={styles.error} role="alert">
            {message}
          </p>
        )}
      </section>

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        label={pending?.kind === 'reset' ? 'Reset progress' : 'Import save'}
        size="small"
      >
        <div className={styles.confirm}>
          {pending?.kind === 'import' && (
            <>
              <h2>Import {pending.fileName}?</h2>
              <p>
                This replaces your current progress with the file's ({solvedIn(pending.save)} levels
                solved). Export first if you want to keep what you have.
              </p>
            </>
          )}
          {pending?.kind === 'reset' && (
            <>
              <h2>Reset all progress?</h2>
              <p>
                Every solved level, chip design and circuit will be deleted. Your settings stay.
                This can't be undone.
              </p>
            </>
          )}
          <div className={styles.buttons}>
            <button type="button" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={pending?.kind === 'reset' ? styles.danger : styles.primary}
              onClick={confirm}
            >
              {pending?.kind === 'reset' ? 'Reset everything' : 'Replace my progress'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
