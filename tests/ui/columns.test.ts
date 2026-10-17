import { describe, expect, it } from 'vitest';
import { groupColumns } from '../../src/ui/level/columns.ts';

describe('groupColumns', () => {
  it('groups most-significant-first bit runs into numbers', () => {
    expect(groupColumns(['A3', 'A2', 'A1', 'A0', 'B3', 'B2', 'B1', 'B0', 'CIN'])).toEqual([
      { label: 'A', pins: ['A3', 'A2', 'A1', 'A0'] },
      { label: 'B', pins: ['B3', 'B2', 'B1', 'B0'] },
      { label: 'CIN', pins: ['CIN'] },
    ]);
  });

  it('leaves single pins, ascending runs and partial runs alone', () => {
    expect(groupColumns(['A', 'B'])).toEqual([
      { label: 'A', pins: ['A'] },
      { label: 'B', pins: ['B'] },
    ]);
    expect(groupColumns(['Y0', 'Y1']).map((c) => c.label)).toEqual(['Y0', 'Y1']);
    expect(groupColumns(['D3', 'D2']).map((c) => c.label)).toEqual(['D3', 'D2']);
  });

  it('groups a 2-bit address', () => {
    expect(groupColumns(['S1', 'S0', 'D0', 'D1', 'D2', 'D3'])[0]).toEqual({
      label: 'S',
      pins: ['S1', 'S0'],
    });
  });
});
