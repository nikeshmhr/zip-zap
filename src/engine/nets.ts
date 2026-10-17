/**
 * Groups connected pins into nets (plan §4.3). A wire joins its output pin and input pin;
 * an input with several wires joins all of their sources (the relay wired-OR case).
 */
import type { ComponentInstance, PinRef, Wire } from './model.ts';
import type { ComponentDef } from './primitives.ts';

export interface Net {
  /** Output pins that drive this net. */
  drivers: PinRef[];
  /** Input pins that read this net. */
  readers: PinRef[];
  /** Ids of the wires that make up this net. */
  wires: string[];
}

export const pinKey = (ref: PinRef): string => `${ref.comp}#${ref.pin}`;

/**
 * Every pin of every component ends up in exactly one net, so unconnected pins get a net of
 * their own. Wires must already be valid (output → input, existing pins).
 */
export function groupNets(
  components: readonly ComponentInstance[],
  defs: ReadonlyMap<string, ComponentDef>,
  wires: readonly Wire[],
): { nets: Net[]; netOf: Map<string, number> } {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression.
    for (let k = key; k !== root;) {
      const next = parent.get(k)!;
      parent.set(k, root);
      k = next;
    }
    return root;
  };

  const pins: { ref: PinRef; isDriver: boolean }[] = [];
  const seen = new Set<string>();
  for (const c of components) {
    const def = defs.get(c.id);
    if (!def || seen.has(c.id)) continue;
    seen.add(c.id);
    for (const pin of def.outputs) pins.push({ ref: { comp: c.id, pin }, isDriver: true });
    for (const pin of def.inputs) pins.push({ ref: { comp: c.id, pin }, isDriver: false });
  }
  for (const { ref } of pins) parent.set(pinKey(ref), pinKey(ref));

  for (const w of wires) {
    const a = find(pinKey(w.from));
    const b = find(pinKey(w.to));
    if (a !== b) parent.set(a, b);
  }

  const nets: Net[] = [];
  const indexOfRoot = new Map<string, number>();
  const netOf = new Map<string, number>();
  for (const { ref, isDriver } of pins) {
    const root = find(pinKey(ref));
    let index = indexOfRoot.get(root);
    if (index === undefined) {
      index = nets.push({ drivers: [], readers: [], wires: [] }) - 1;
      indexOfRoot.set(root, index);
    }
    netOf.set(pinKey(ref), index);
    (isDriver ? nets[index]!.drivers : nets[index]!.readers).push(ref);
  }
  for (const w of wires) nets[netOf.get(pinKey(w.from))!]!.wires.push(w.id);

  return { nets, netOf };
}
