/**
 * The editor's wiring rules (spec §5, §8): refuse connections that validation would reject,
 * with a message the player can act on, so shorts can't be created by hand.
 */
import type { Circuit, PinRef } from '../engine/model.ts';
import type { ComponentResolver } from '../engine/primitives.ts';
import type { ValidateOptions } from '../engine/validate.ts';
import { nextId } from './editing.ts';

export interface PinEnd {
  ref: PinRef;
  dir: 'in' | 'out';
}

export interface WiringContext {
  resolve: ComponentResolver;
  options?: ValidateOptions;
}

export type ConnectResult =
  { ok: true; circuit: Circuit; wireId: string } | { ok: false; reason: string };

const same = (a: PinRef, b: PinRef) => a.comp === b.comp && a.pin === b.pin;

/** Connects two pins in either order (the output end becomes the wire's source). */
export function connect(circuit: Circuit, a: PinEnd, b: PinEnd, ctx: WiringContext): ConnectResult {
  if (a.dir === b.dir) {
    return {
      ok: false,
      reason:
        a.dir === 'out'
          ? "Two outputs can't be wired together. Connect an output to an input."
          : 'Connect an output to an input.',
    };
  }
  const from = a.dir === 'out' ? a.ref : b.ref;
  const to = a.dir === 'out' ? b.ref : a.ref;

  const kindOf = (comp: string) => circuit.components.find((c) => c.id === comp)?.kind;
  const fromKind = kindOf(from.comp);
  const toKind = kindOf(to.comp);
  if (!fromKind || !toKind) return { ok: false, reason: 'That pin no longer exists.' };

  const into = circuit.wires.filter((w) => same(w.to, to));
  if (into.some((w) => same(w.from, from))) return { ok: false, reason: 'Already connected.' };

  if (into.length > 0) {
    const isRelay = (comp: string) => {
      const kind = kindOf(comp);
      return !!kind && !!ctx.resolve(kind)?.wiredOrOutput;
    };
    if (!isRelay(from.comp) || !into.every((w) => isRelay(w.from.comp))) {
      return {
        ok: false,
        reason:
          'That input already has a wire. Only relay outputs can be joined; delete the old wire first.',
      };
    }
  }

  const allowed = ctx.options?.inputsOnlyDrive;
  if (allowed && fromKind === 'in' && !allowed.some((t) => t.kind === toKind && t.pin === to.pin)) {
    return {
      ok: false,
      reason: 'In this level, input switches can only drive relay coils. Use Power for current.',
    };
  }

  const wireId = nextId(
    circuit.wires.map((w) => w.id),
    'w',
  );
  return {
    ok: true,
    wireId,
    circuit: { ...circuit, wires: [...circuit.wires, { id: wireId, from, to }] },
  };
}
