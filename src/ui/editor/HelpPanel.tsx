import { isApple, shortcutList } from './shortcuts.ts';
import styles from './HelpPanel.module.css';

/** A "?" button that opens the list of editor shortcuts. */
export interface HelpPanelProps {
  open: boolean;
  onToggle(): void;
  onFit(): void;
}

/** Bottom-right view controls: fit the circuit in view, and the shortcuts list. */
export function HelpPanel({ open, onToggle, onFit }: HelpPanelProps) {
  return (
    <div className={styles.help}>
      {open && (
        <div
          className={styles.panel}
          id="editor-shortcuts"
          role="dialog"
          aria-label="Keyboard shortcuts"
        >
          <div className={styles.header}>
            <h2>Keyboard shortcuts</h2>
            <button type="button" className={styles.close} aria-label="Close" onClick={onToggle}>
              ×
            </button>
          </div>
          <dl>
            {shortcutList(isApple() ? '⌘' : 'Ctrl').map(({ keys, action }) => (
              <div key={action}>
                <dt>
                  <kbd>{keys}</kbd>
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.button}
          aria-label="Fit circuit in view"
          title="Fit circuit in view (F)"
          onClick={onFit}
        >
          ⤢
        </button>
        <button
          type="button"
          className={styles.button}
          aria-expanded={open}
          aria-controls="editor-shortcuts"
          aria-label="Keyboard shortcuts"
          onClick={onToggle}
        >
          ?
        </button>
      </div>
    </div>
  );
}
