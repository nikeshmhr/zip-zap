/**
 * Level definitions (plan §5.1). Levels are data: adding a chapter never touches the engine.
 */
import type { CircuitBuilder } from '../engine/builder.ts';
import type { ComponentKind } from '../engine/model.ts';
import type { Goal } from '../engine/testRunner.ts';
import type { PinTarget } from '../engine/validate.ts';

export type LevelId = string;

export interface ChapterDef {
  id: number;
  title: string;
  /** One sentence shown on the map. */
  blurb: string;
}

export interface Toolbox {
  /**
   * `'unlocked'`: constants plus everything unlocked by earlier levels.
   * A list: exactly these kinds (used in Chapter 0, before anything is unlocked).
   */
  include: 'unlocked' | readonly ComponentKind[];
  exclude?: readonly ComponentKind[];
}

export interface ClockRules {
  /** The clock input. A step that changes it changes nothing else (spec §15.7). */
  pin: string;
  /** Whether the circuit reacts to its edges (marked ↑/↓). False for a latch's enable. */
  edges?: boolean;
  /**
   * Inputs that never change while the clock is high, so designs that gate the clock with
   * them (e.g. `AND(CLK, LOAD)`) aren't failed in the MVP.
   */
  holdWhileHigh?: readonly string[];
}

export interface LevelDef {
  id: LevelId;
  chapter: number;
  title: string;
  /** The goal in one sentence, shown above the truth table. */
  summary: string;
  /** Input pins in truth-table column order. Chips unlocked by this level use the same pins. */
  inputs: readonly string[];
  outputs: readonly string[];
  goal: Goal;
  /**
   * Order of the input switches and output lamps on the canvas, top to bottom, if it should
   * differ from the truth-table order (e.g. interleaving A0, B0, A1, B1… for adders, so each
   * bit's inputs sit together). Must list exactly the level's pins.
   */
  layout?: { inputs?: readonly string[]; outputs?: readonly string[] };
  /** Sequential levels with a clock. */
  clock?: ClockRules;
  toolbox: Toolbox;
  constraints?: { inputsOnlyDrive?: readonly PinTarget[] };
  /** The component this level adds to the toolbox: `nand`, or a chip kind. */
  unlocks?: { kind: ComponentKind; name: string };
  /** Markdown, at most 150 words. */
  concept: string;
  /** A nudge, then a strong hint. Never the full solution. */
  hints: readonly [string, string];
  /** A known solution, checked by the content tests. */
  reference: (b: CircuitBuilder) => void;
}
