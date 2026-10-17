import { isApple, shortcutList } from './shortcuts.ts';
import styles from './HelpPanel.module.css';

/** A "?" button that opens the list of editor shortcuts. */
export function HelpPanel({ open, onToggle }: { open: boolean; onToggle(): void }) {
  return (
    <div className={styles.help}>
      {open && (
        <div
          className={styles.panel}
          id="editor-shortcuts"
          role="dialog"
          aria-label="Keyboard shortcuts"
        >
          <h2>Keyboard shortcuts</h2>
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
  );
}
