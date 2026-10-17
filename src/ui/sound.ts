/**
 * Small synthesised sound effects (spec §11): a relay click and a solve chime. Nothing plays
 * when sound is off in Settings. The audio context is created on first use, which always
 * follows a click, as browsers require.
 */
import { useSettings } from '../state/settings.ts';

export type SoundName = 'click' | 'chime';

export interface SoundPlayer {
  play(name: SoundName): void;
  /** The most recent sounds played (for tests). */
  readonly log: readonly SoundName[];
}

type ContextFactory = () => AudioContext | null;

const defaultContext: ContextFactory = () =>
  typeof window !== 'undefined' && 'AudioContext' in window ? new AudioContext() : null;

function tone(
  ctx: AudioContext,
  {
    type,
    frequency,
    start,
    duration,
    volume,
  }: {
    type: OscillatorType;
    frequency: number;
    start: number;
    duration: number;
    volume: number;
  },
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

export function createSoundPlayer(
  enabled: () => boolean,
  makeContext: ContextFactory = defaultContext,
): SoundPlayer {
  let ctx: AudioContext | null | undefined;
  const log: SoundName[] = [];
  let lastClick = -Infinity;

  return {
    log,
    play(name) {
      if (!enabled()) return;
      ctx ??= makeContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      if (name === 'click') {
        // Many relays switching at once should sound like one clack, not a buzz.
        if (now - lastClick < 0.04) return;
        lastClick = now;
        tone(ctx, { type: 'square', frequency: 1900, start: now, duration: 0.018, volume: 0.04 });
        tone(ctx, { type: 'triangle', frequency: 420, start: now, duration: 0.03, volume: 0.05 });
      } else {
        tone(ctx, { type: 'sine', frequency: 659.25, start: now, duration: 0.18, volume: 0.12 });
        tone(ctx, {
          type: 'sine',
          frequency: 987.77,
          start: now + 0.12,
          duration: 0.3,
          volume: 0.12,
        });
      }
      log.push(name);
      if (log.length > 20) log.shift();
    },
  };
}

/** The game's sound player, following the Sound setting. */
export const sounds = createSoundPlayer(() => useSettings.getState().settings.sound);
