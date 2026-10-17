/**
 * An accessible modal built on <dialog>: focus is trapped, Escape closes it, and the page
 * behind is inert.
 */
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onClose(): void;
  /** Accessible name. */
  label: string;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large';
}

export function Modal({ open, onClose, label, children, size = 'medium' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.modal}
      data-size={size}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.content}>{children}</div>
    </dialog>
  );
}
