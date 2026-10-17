/**
 * What a pointer event landed on, read from the data attributes parts and wires render.
 */
import type { PinRef } from '../../engine/model.ts';

export type HitTarget =
  | { type: 'pin'; ref: PinRef; dir: 'in' | 'out' }
  | { type: 'toggle'; name: string }
  | { type: 'part'; id: string }
  | { type: 'wire'; id: string }
  | { type: 'bend'; wire: string; index: number }
  | { type: 'canvas' };

export const pinKeyAttr = (part: string, pin: string, dir: 'in' | 'out') => `${part}|${pin}|${dir}`;

export function parsePinAttr(value: string): { ref: PinRef; dir: 'in' | 'out' } {
  const [comp = '', pin = '', dir] = value.split('|');
  return { ref: { comp, pin }, dir: dir === 'out' ? 'out' : 'in' };
}

/** Classifies the element under the pointer (pins win over parts, parts over the canvas). */
export function hitTest(target: EventTarget | null): HitTarget {
  if (!(target instanceof Element)) return { type: 'canvas' };
  const pin = target.closest('[data-pin]');
  if (pin) return { type: 'pin', ...parsePinAttr(pin.getAttribute('data-pin')!) };
  const bend = target.closest('[data-bend]');
  if (bend) {
    const [wire = '', index = '0'] = bend.getAttribute('data-bend')!.split('|');
    return { type: 'bend', wire, index: Number(index) };
  }
  const toggle = target.closest('[data-toggle]');
  if (toggle) return { type: 'toggle', name: toggle.getAttribute('data-toggle')! };
  const wire = target.closest('[data-wire]');
  if (wire) return { type: 'wire', id: wire.getAttribute('data-wire')! };
  const part = target.closest('[data-part]');
  if (part) return { type: 'part', id: part.getAttribute('data-part')! };
  return { type: 'canvas' };
}
