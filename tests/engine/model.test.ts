import { describe, expect, it } from 'vitest';
import {
  bus,
  chipIdOf,
  chipKind,
  enumerateRows,
  formatBits,
  isChipKind,
  isIoKind,
  readBus,
  toBit,
  writeBus,
} from '../../src/engine/model.ts';

describe('kind helpers', () => {
  it('round-trips chip ids', () => {
    const kind = chipKind('xor');
    expect(kind).toBe('chip:xor');
    expect(isChipKind(kind)).toBe(true);
    expect(chipIdOf(kind)).toBe('xor');
  });

  it('distinguishes primitives, IO and chips', () => {
    expect(isChipKind('nand')).toBe(false);
    expect(isIoKind('in')).toBe(true);
    expect(isIoKind('out')).toBe(true);
    expect(isIoKind('nand')).toBe(false);
  });
});

describe('enumerateRows', () => {
  it('produces 2^n rows in truth-table order, first name most significant', () => {
    const rows = enumerateRows(['A', 'B']);
    expect(rows).toEqual([
      { A: 0, B: 0 },
      { A: 0, B: 1 },
      { A: 1, B: 0 },
      { A: 1, B: 1 },
    ]);
  });

  it('handles zero inputs as a single empty row', () => {
    expect(enumerateRows([])).toEqual([{}]);
  });

  it('scales to 9 inputs (4-bit adder)', () => {
    const rows = enumerateRows(bus('X', 9));
    expect(rows).toHaveLength(512);
    expect(new Set(rows.map((r) => formatBits(r, bus('X', 9)))).size).toBe(512);
  });
});

describe('bus helpers', () => {
  it('names bits least significant first', () => {
    expect(bus('A', 4)).toEqual(['A0', 'A1', 'A2', 'A3']);
  });

  it('round-trips every 4-bit value', () => {
    for (let n = 0; n < 16; n++) expect(readBus(writeBus('S', 4, n), 'S', 4)).toBe(n);
  });

  it('writes the low bits only', () => {
    expect(writeBus('S', 4, 0b10110)).toEqual({ S0: 0, S1: 1, S2: 1, S3: 0 });
  });

  it('reads missing bits as 0', () => {
    expect(readBus({ A1: 1 }, 'A', 4)).toBe(2);
  });
});

describe('bit helpers', () => {
  it('converts truthy values to bits', () => {
    expect(toBit(true)).toBe(1);
    expect(toBit(0)).toBe(0);
    expect(toBit(4)).toBe(1);
  });

  it('formats bits in the given order', () => {
    expect(formatBits({ A: 1, B: 0, C: 1 }, ['C', 'B', 'A'])).toBe('101');
  });
});
