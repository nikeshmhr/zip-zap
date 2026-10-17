import { describe, expect, it } from 'vitest';
import type { Circuit } from '../../src/engine/model.ts';
import { primitiveResolver } from '../../src/engine/primitives.ts';
import { validate } from '../../src/engine/validate.ts';
import { addComponent, startCircuit } from '../../src/state/editing.ts';
import type { PinEnd, WiringContext } from '../../src/state/wiring.ts';
import { connect } from '../../src/state/wiring.ts';

const ctx: WiringContext = { resolve: primitiveResolver };
const out = (comp: string, pin = 'out'): PinEnd => ({ ref: { comp, pin }, dir: 'out' });
const inp = (comp: string, pin: string): PinEnd => ({ ref: { comp, pin }, dir: 'in' });

/** A, B → OUT, with parts p1… added in order. */
function circuitWith(...kinds: Parameters<typeof addComponent>[1][]): Circuit {
  let c = startCircuit({ inputs: ['A', 'B'], outputs: ['OUT'] });
  kinds.forEach((kind, i) => (c = addComponent(c, kind, { x: 10 + i * 6, y: 0 }).circuit));
  return c;
}

function connectAll(c: Circuit, pairs: [PinEnd, PinEnd][], context = ctx): Circuit {
  for (const [a, b] of pairs) {
    const result = connect(c, a, b, context);
    if (!result.ok) throw new Error(result.reason);
    c = result.circuit;
  }
  return c;
}

describe('connect', () => {
  it('wires an output to an input in either drag direction', () => {
    const c = circuitWith('nand');
    const forward = connect(c, out('in:A'), inp('p1', 'a'), ctx);
    const backward = connect(c, inp('p1', 'a'), out('in:A'), ctx);
    expect(forward.ok && backward.ok).toBe(true);
    if (forward.ok && backward.ok) {
      expect(forward.circuit.wires).toEqual(backward.circuit.wires);
      expect(forward.circuit.wires).toEqual([
        { id: 'w1', from: { comp: 'in:A', pin: 'out' }, to: { comp: 'p1', pin: 'a' } },
      ]);
    }
  });

  it('lets one output fan out to many inputs', () => {
    const c = connectAll(circuitWith('nand'), [
      [out('in:A'), inp('p1', 'a')],
      [out('in:A'), inp('p1', 'b')],
    ]);
    expect(c.wires).toHaveLength(2);
  });

  it('refuses output→output, input→input and duplicates', () => {
    const c = connectAll(circuitWith('nand', 'nand'), [[out('p1'), inp('p2', 'a')]]);
    expect(connect(c, out('p1'), out('p2'), ctx)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/Two outputs/),
    });
    expect(connect(c, inp('p1', 'a'), inp('p2', 'b'), ctx)).toMatchObject({ ok: false });
    expect(connect(c, out('p1'), inp('p2', 'a'), ctx)).toEqual({
      ok: false,
      reason: 'Already connected.',
    });
  });

  it('refuses a second wire into an input, so shorts cannot be drawn', () => {
    const c = connectAll(circuitWith('nand', 'nand'), [[out('p1'), inp('out:OUT', 'in')]]);
    const result = connect(c, out('p2'), inp('out:OUT', 'in'), ctx);
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/already has a wire/),
    });
  });

  it('joins relay outputs into the same input (wired-OR), and the result validates', () => {
    let c = circuitWith('power', 'relayNC', 'relayNC');
    c = connectAll(c, [
      [out('p1'), inp('p2', 'in')],
      [out('p1'), inp('p3', 'in')],
      [out('in:A'), inp('p2', 'coil')],
      [out('in:B'), inp('p3', 'coil')],
      [out('p2'), inp('out:OUT', 'in')],
      [out('p3'), inp('out:OUT', 'in')],
    ]);
    expect(validate(c, primitiveResolver).ok).toBe(true);
  });

  it('refuses joining a relay with a non-relay output', () => {
    const c = connectAll(circuitWith('relayNO', 'nand'), [[out('p1'), inp('out:OUT', 'in')]]);
    expect(connect(c, out('p2'), inp('out:OUT', 'in'), ctx).ok).toBe(false);
    expect(connect(c, out('in:A'), inp('out:OUT', 'in'), ctx).ok).toBe(false);
  });

  it('enforces level input restrictions', () => {
    const restricted: WiringContext = {
      resolve: primitiveResolver,
      options: { inputsOnlyDrive: [{ kind: 'relayNO', pin: 'coil' }] },
    };
    const c = circuitWith('relayNO');
    expect(connect(c, out('in:A'), inp('out:OUT', 'in'), restricted)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/relay coils/),
    });
    expect(connect(c, out('in:A'), inp('p1', 'coil'), restricted).ok).toBe(true);
  });
});
