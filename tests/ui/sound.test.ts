import { describe, expect, it, vi } from 'vitest';
import { createSoundPlayer } from '../../src/ui/sound.ts';

/** A minimal stand-in for AudioContext that counts oscillators. */
function fakeContext() {
  const oscillators: { type: string }[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => ({ connect: vi.fn((next: unknown) => next) });
  let currentTime = 0;
  const ctx = {
    get currentTime() {
      return currentTime;
    },
    destination: {},
    createOscillator: () => {
      const osc = { ...node(), type: '', frequency: param(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(osc);
      return osc;
    },
    createGain: () => ({ ...node(), gain: param() }),
  };
  return {
    ctx: ctx as unknown as AudioContext,
    oscillators,
    advance: (s: number) => (currentTime += s),
  };
}

describe('sound player', () => {
  it('plays a click and a chime when sound is on', () => {
    const fake = fakeContext();
    const player = createSoundPlayer(
      () => true,
      () => fake.ctx,
    );
    player.play('click');
    fake.advance(1);
    player.play('chime');
    expect(player.log).toEqual(['click', 'chime']);
    expect(fake.oscillators.length).toBe(4);
  });

  it('plays nothing, and creates no audio context, when sound is off', () => {
    const make = vi.fn(() => fakeContext().ctx);
    const player = createSoundPlayer(() => false, make);
    player.play('click');
    player.play('chime');
    expect(make).not.toHaveBeenCalled();
    expect(player.log).toEqual([]);
  });

  it('merges clicks that come too close together', () => {
    const fake = fakeContext();
    const player = createSoundPlayer(
      () => true,
      () => fake.ctx,
    );
    player.play('click');
    player.play('click');
    fake.advance(0.1);
    player.play('click');
    expect(player.log).toEqual(['click', 'click']);
  });

  it('copes with browsers that have no audio', () => {
    const player = createSoundPlayer(
      () => true,
      () => null,
    );
    expect(() => player.play('chime')).not.toThrow();
  });
});
