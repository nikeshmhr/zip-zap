import { describe, expect, it } from 'vitest';
import { buildCircuit } from '../../src/engine/builder.ts';
import type { CircuitBuilder, LevelIo } from '../../src/engine/builder.ts';
import { primitiveResolver } from '../../src/engine/primitives.ts';
import type { ValidateOptions } from '../../src/engine/validate.ts';
import { validate } from '../../src/engine/validate.ts';

const io: LevelIo = { inputs: ['A', 'B'], outputs: ['OUT'] };

/** Builds without builder-side pin checks so invalid circuits can be expressed. */
const check = (recipe: (b: CircuitBuilder) => void, options?: ValidateOptions) =>
  validate(buildCircuit(io, recipe), primitiveResolver, options);

const codes = (v: ReturnType<typeof check>) => v.issues.map((i) => i.code);

describe('validate: valid circuits', () => {
  it('accepts a NAND gate', () => {
    const v = check((b) => {
      const n = b.add('nand');
      b.wire('A', n.in('a'));
      b.wire('B', n.in('b'));
      b.wire(n.out('out'), 'OUT');
    });
    expect(v.ok).toBe(true);
    expect(v.issues).toEqual([]);
  });

  it('accepts unconnected pins (they read OFF)', () => {
    expect(check((b) => void b.add('nand')).ok).toBe(true);
  });

  it('groups a fan-out into one net with one driver and many readers', () => {
    const v = check((b) => {
      const n = b.add('nand');
      b.wire('A', n.in('a'));
      b.wire('A', n.in('b'));
    });
    const net = v.nets[v.netOf.get('in:A#out')!]!;
    expect(net.drivers).toEqual([{ comp: 'in:A', pin: 'out' }]);
    expect(net.readers).toHaveLength(2);
    expect(net.wires).toEqual(['w1', 'w2']);
  });
});

describe('validate: relay joins (wired-OR)', () => {
  /** Level 0.4 reference: two NC relays in parallel = NAND. */
  const parallelRelays = (b: CircuitBuilder) => {
    const p = b.add('power');
    const r1 = b.add('relayNC');
    const r2 = b.add('relayNC');
    b.wire(p.out('out'), r1.in('in'));
    b.wire(p.out('out'), r2.in('in'));
    b.wire('A', r1.in('coil'));
    b.wire('B', r2.in('coil'));
    b.wire(r1.out('out'), 'OUT');
    b.wire(r2.out('out'), 'OUT');
  };

  it('joins two relay outputs wired into the same input', () => {
    const v = check(parallelRelays);
    expect(v.ok).toBe(true);
    const net = v.nets[v.netOf.get('out:OUT#in')!]!;
    expect(net.drivers.map((d) => d.comp).sort()).toEqual(['c2', 'c3']);
  });

  it('treats two NAND outputs into one input as a short', () => {
    const v = check((b) => {
      const n1 = b.add('nand');
      const n2 = b.add('nand');
      b.wire(n1.out('out'), 'OUT');
      b.wire(n2.out('out'), 'OUT');
    });
    expect(v.ok).toBe(false);
    expect(v.issues).toEqual([
      expect.objectContaining({
        code: 'short',
        severity: 'short',
        components: ['c1', 'c2'],
        wires: ['w1', 'w2'],
      }),
    ]);
  });

  it('treats a relay joined with a NAND as a short', () => {
    const v = check((b) => {
      const r = b.add('relayNO');
      const n = b.add('nand');
      b.wire(r.out('out'), 'OUT');
      b.wire(n.out('out'), 'OUT');
    });
    expect(codes(v)).toEqual(['short']);
  });

  it('treats a level input joined with a relay as a short', () => {
    const v = check((b) => {
      const r = b.add('relayNO');
      b.wire(r.out('out'), 'OUT');
      b.wire('A', 'OUT');
    });
    expect(codes(v)).toEqual(['short']);
  });

  it('finds shorts that span several inputs on one net', () => {
    const v = check((b) => {
      const r = b.add('relayNO');
      const n = b.add('nand');
      const sink = b.add('nand');
      b.wire(r.out('out'), sink.in('a'));
      b.wire(r.out('out'), 'OUT');
      b.wire(n.out('out'), sink.in('a'));
    });
    expect(codes(v)).toEqual(['short']);
    expect(v.issues[0]!.wires).toHaveLength(3);
  });
});

describe('validate: invalid circuits', () => {
  it('rejects duplicate component ids', () => {
    const c = buildCircuit(io, (b) => void b.add('nand'));
    c.components.push({ ...c.components.at(-1)! });
    expect(codes(validate(c, primitiveResolver))).toEqual(['duplicate-id']);
  });

  it('rejects two level pins with the same name', () => {
    const c = buildCircuit(io, () => {});
    c.components.push({ id: 'in:A2', kind: 'in', label: 'A', pos: { x: 0, y: 0 }, rot: 0 });
    c.components.push({ id: 'out:X1', kind: 'out', label: 'OUT', pos: { x: 0, y: 0 }, rot: 0 });
    const v = validate(c, primitiveResolver);
    expect(v.issues.map((i) => [i.code, i.components])).toEqual([
      ['duplicate-label', ['in:A', 'in:A2']],
      ['duplicate-label', ['out:OUT', 'out:X1']],
    ]);
  });

  it('checks IO against the level when asked', () => {
    const c = buildCircuit({ inputs: ['A', 'Z'], outputs: [] }, () => {});
    const v = validate(c, primitiveResolver, { io });
    expect(v.issues.map((i) => i.message)).toEqual([
      "Level inputs don't match the level: missing B; unexpected Z",
      "Level outputs don't match the level: missing OUT",
    ]);
    expect(
      validate(
        buildCircuit(io, () => {}),
        primitiveResolver,
        { io },
      ).ok,
    ).toBe(true);
  });

  it('rejects unknown component kinds', () => {
    expect(codes(check((b) => void b.add('chip:nope')))).toEqual(['unknown-kind']);
  });

  it('rejects components outside the toolbox, but always allows level IO', () => {
    const v = check(
      (b) => {
        const n = b.add('nand');
        b.wire('A', n.in('a'));
      },
      { allowedKinds: new Set(['relayNO']) },
    );
    expect(codes(v)).toEqual(['not-in-toolbox']);
  });

  it('rejects wires to pins that do not exist', () => {
    const v = check((b) => {
      const n = b.add('nand');
      b.wire('A', n.in('nope'));
      b.wire({ comp: 'ghost', pin: 'out' }, 'OUT');
    });
    expect(codes(v)).toEqual(['dangling', 'dangling']);
    expect(v.validWires).toEqual([]);
  });

  it('rejects wires that run input → output or output → output', () => {
    const v = check((b) => {
      const n1 = b.add('nand');
      const n2 = b.add('nand');
      b.wire(n1.in('a'), 'OUT');
      b.wire(n1.out('out'), n2.out('out'));
    });
    expect(codes(v)).toEqual(['wrong-direction', 'wrong-direction']);
  });

  it('rejects duplicate wires', () => {
    const v = check((b) => {
      b.wire('A', 'OUT');
      b.wire('A', 'OUT');
    });
    expect(codes(v)).toEqual(['duplicate-wire']);
  });

  it('enforces input restrictions (level 0.1: inputs only drive relay coils)', () => {
    const options: ValidateOptions = { inputsOnlyDrive: [{ kind: 'relayNO', pin: 'coil' }] };
    const direct = check((b) => b.wire('A', 'OUT'), options);
    expect(codes(direct)).toEqual(['restricted-input']);

    const viaRelay = check((b) => {
      const p = b.add('power');
      const r = b.add('relayNO');
      b.wire('A', r.in('coil'));
      b.wire(p.out('out'), r.in('in'));
      b.wire(r.out('out'), 'OUT');
    }, options);
    expect(viaRelay.ok).toBe(true);
  });
});
