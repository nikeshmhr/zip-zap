/**
 * Structural checks run before compiling a circuit (plan §4.6, spec §5).
 */
import type { Circuit, ComponentKind, Wire } from './model.ts';
import { isIoKind } from './model.ts';
import type { Net } from './nets.ts';
import { groupNets, pinKey } from './nets.ts';
import type { ComponentDef, ComponentResolver } from './primitives.ts';

export type IssueCode =
  | 'duplicate-id'
  | 'unknown-kind'
  | 'not-in-toolbox'
  | 'dangling'
  | 'wrong-direction'
  | 'duplicate-wire'
  | 'restricted-input'
  | 'short';

export interface Issue {
  code: IssueCode;
  /** `short` blocks testing with its own message (spec §5.2); everything else is `invalid`. */
  severity: 'short' | 'invalid';
  message: string;
  components?: string[];
  wires?: string[];
}

/** An allowed destination for wires leaving level inputs. */
export interface PinTarget {
  kind: ComponentKind;
  pin: string;
}

export interface ValidateOptions {
  /** The level's toolbox. Level IO is always allowed. Omit to allow every known kind. */
  allowedKinds?: ReadonlySet<ComponentKind>;
  /** If set, level inputs may only be wired to these pins (e.g. relay coils in level 0.1). */
  inputsOnlyDrive?: readonly PinTarget[];
}

export interface Validation {
  ok: boolean;
  issues: Issue[];
  /** Definitions for components whose kind resolved. */
  defs: Map<string, ComponentDef>;
  /** Wires that passed the per-wire checks. */
  validWires: Wire[];
  /** Nets built from the valid wires. */
  nets: Net[];
  netOf: Map<string, number>;
}

export function validate(
  circuit: Circuit,
  resolve: ComponentResolver,
  options: ValidateOptions = {},
): Validation {
  const issues: Issue[] = [];
  const invalid = (code: IssueCode, message: string, extra: Partial<Issue> = {}) =>
    issues.push({ code, severity: 'invalid', message, ...extra });

  // Components.
  const defs = new Map<string, ComponentDef>();
  const kinds = new Map<string, ComponentKind>();
  for (const c of circuit.components) {
    if (kinds.has(c.id)) {
      invalid('duplicate-id', `Two components share the id "${c.id}"`, { components: [c.id] });
      continue;
    }
    kinds.set(c.id, c.kind);
    const def = resolve(c.kind);
    if (!def) {
      invalid('unknown-kind', `Unknown component "${c.kind}"`, { components: [c.id] });
      continue;
    }
    if (options.allowedKinds && !isIoKind(c.kind) && !options.allowedKinds.has(c.kind)) {
      invalid('not-in-toolbox', `"${c.kind}" isn't available in this level`, {
        components: [c.id],
      });
    }
    defs.set(c.id, def);
  }

  // Wires.
  const validWires: Wire[] = [];
  const seen = new Set<string>();
  for (const w of circuit.wires) {
    const fromDef = defs.get(w.from.comp);
    const toDef = defs.get(w.to.comp);
    const fromIsOutput = fromDef?.outputs.includes(w.from.pin);
    const toIsInput = toDef?.inputs.includes(w.to.pin);
    const fromExists = fromIsOutput || fromDef?.inputs.includes(w.from.pin);
    const toExists = toIsInput || toDef?.outputs.includes(w.to.pin);

    if (!fromExists || !toExists) {
      invalid('dangling', 'A wire is connected to a pin that does not exist', { wires: [w.id] });
      continue;
    }
    if (!fromIsOutput || !toIsInput) {
      invalid('wrong-direction', 'Wires must run from an output pin to an input pin', {
        wires: [w.id],
      });
      continue;
    }
    const key = `${pinKey(w.from)}>${pinKey(w.to)}`;
    if (seen.has(key)) {
      invalid('duplicate-wire', 'Two wires connect the same pins', { wires: [w.id] });
      continue;
    }
    seen.add(key);

    const allowed = options.inputsOnlyDrive;
    const toKind = kinds.get(w.to.comp)!;
    if (
      allowed &&
      kinds.get(w.from.comp) === 'in' &&
      !allowed.some((t) => t.kind === toKind && t.pin === w.to.pin)
    ) {
      const where = allowed.map((t) => `${t.kind}.${t.pin}`).join(', ');
      invalid('restricted-input', `In this level, inputs can only connect to: ${where}`, {
        wires: [w.id],
      });
      continue;
    }
    validWires.push(w);
  }

  // Shorts: a net with several drivers is only allowed when all of them are wired-OR outputs.
  const { nets, netOf } = groupNets(circuit.components, defs, validWires);
  for (const net of nets) {
    if (net.drivers.length < 2) continue;
    if (net.drivers.every((d) => defs.get(d.comp)?.wiredOrOutput)) continue;
    issues.push({
      code: 'short',
      severity: 'short',
      message: 'Two outputs are wired together. Only relay outputs can be joined.',
      components: [...new Set(net.drivers.map((d) => d.comp))],
      wires: net.wires,
    });
  }

  return { ok: issues.length === 0, issues, defs, validWires, nets, netOf };
}
