import { describe, expect, it } from 'vitest';

// Placeholder proving the test pipeline works; replaced by real engine tests in T1.1.
describe('test pipeline', () => {
  it('runs TypeScript tests', () => {
    const bits: readonly number[] = [0, 1, 1, 0];
    expect(bits.reduce((n, b) => n * 2 + b, 0)).toBe(6);
  });
});
