/**
 * A banner message for the player about their save or circuits.
 */
import { create } from 'zustand';

export interface SaveNotice {
  /** A message for the player about their save (e.g. it was damaged and set aside). */
  message?: string;
  /** An optional button, e.g. "Reload". */
  action?: { label: string; run(): void };
  dismiss(): void;
}

export const useSaveNotice = create<SaveNotice>()((set) => ({
  dismiss: () => set({ message: undefined, action: undefined }),
}));
