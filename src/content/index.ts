/**
 * The game's content: chapters and levels in play order.
 */
import { CH0 } from './levels/ch0.ts';
import { CH1 } from './levels/ch1.ts';
import { CH2 } from './levels/ch2.ts';
import { CH3 } from './levels/ch3.ts';
import { CH4 } from './levels/ch4.ts';
import { createCatalogue } from './registry.ts';
import type { ChapterDef } from './types.ts';

export const CHAPTERS: readonly ChapterDef[] = [
  { id: 0, title: 'Switches', blurb: 'Relays, current, and the discovery of NAND.' },
  { id: 1, title: 'Gates', blurb: 'Build every logic gate from NAND alone.' },
  { id: 2, title: 'Routing', blurb: 'Choose which signal goes where.' },
  { id: 3, title: 'Arithmetic', blurb: 'Binary numbers, adding and subtracting.' },
  { id: 4, title: 'Memory', blurb: 'Feedback, the clock, and a tiny RAM.' },
];

export const LEVELS = [...CH0, ...CH1, ...CH2, ...CH3, ...CH4];

export const catalogue = createCatalogue(CHAPTERS, LEVELS);
