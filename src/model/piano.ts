/**
 * piano — the geometry of an on-screen, two-octave keyboard.
 *
 * Phaser-free arithmetic, because key placement is the kind of thing that is
 * either right or subtly wrong: a black key a pixel off looks like a bug, and
 * black keys that drift out of their group look like a broken piano. Keeping it
 * here means the layout can be asserted in tests instead of squinted at.
 *
 * The layout deliberately rounds each key's edges rather than its width, so the
 * white keys TILE the given width exactly — no hairline gaps between keys, and
 * no cumulative drift across fourteen of them.
 */

import { KEYBOARD_SEMITONES } from './notes';

/** The semitones that are white keys within an octave. */
const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;
const WHITES_PER_OCTAVE = WHITE_SEMITONES.length; // 7
const OCTAVES = KEYBOARD_SEMITONES / 12; // 2

/**
 * Which white key each black key sits after, within its octave: C# leans on C,
 * D# on D, and F#/G#/A# on F/G/A (there is no black key between E and F).
 */
const BLACK_AFTER_WHITE: Readonly<Record<number, number>> = {
  1: 0, 3: 1, 6: 3, 8: 4, 10: 5,
};

export interface PianoKeyRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PianoKey {
  /** The MIDI note this key plays. */
  midi: number;
  /** Its distance above the base note, 0..23. */
  semitone: number;
  /** White keys are drawn first and full height; black keys sit on top. */
  white: boolean;
  rect: PianoKeyRect;
}

export interface PianoLayoutOptions {
  /** Horizontal gap between the two octave groups. */
  octaveGap?: number;
  /** Black key width as a fraction of a white key's. */
  blackWidthRatio?: number;
  /** Black key height as a fraction of the keyboard's. */
  blackHeightRatio?: number;
}

/**
 * Lay out two octaves of keys inside `width` x `height`, starting at
 * `baseMidi`. The result is ordered whites-then-blacks, which is also the
 * painting order: black keys overlap their neighbours.
 */
export function pianoKeys(
  width: number,
  height: number,
  baseMidi: number,
  options: PianoLayoutOptions = {},
): PianoKey[] {
  const gap = Math.max(0, options.octaveGap ?? 8);
  const blackWidthRatio = options.blackWidthRatio ?? 0.62;
  const blackHeightRatio = options.blackHeightRatio ?? 0.6;

  const totalWhites = WHITES_PER_OCTAVE * OCTAVES;
  const whiteW = Math.max(1, (width - gap) / totalWhites);
  const blackW = Math.max(1, Math.round(whiteW * blackWidthRatio));
  const blackH = Math.max(1, Math.round(height * blackHeightRatio));

  const keys: PianoKey[] = [];

  // White keys: round the EDGES so consecutive keys share a boundary exactly.
  for (let octave = 0; octave < OCTAVES; octave++) {
    const groupX = octave * (WHITES_PER_OCTAVE * whiteW + gap);
    for (let i = 0; i < WHITES_PER_OCTAVE; i++) {
      const semitone = octave * 12 + WHITE_SEMITONES[i];
      const x0 = Math.round(groupX + i * whiteW);
      const x1 = Math.round(groupX + (i + 1) * whiteW);
      keys.push({
        midi: baseMidi + semitone,
        semitone,
        white: true,
        rect: { x: x0, y: 0, width: Math.max(1, x1 - x0), height },
      });
    }
  }

  // Black keys: centred on the boundary they lean against.
  for (let octave = 0; octave < OCTAVES; octave++) {
    const groupX = octave * (WHITES_PER_OCTAVE * whiteW + gap);
    for (const [semitoneInOctave, afterWhite] of Object.entries(BLACK_AFTER_WHITE)) {
      const semitone = octave * 12 + Number(semitoneInOctave);
      const centre = groupX + (afterWhite + 1) * whiteW;
      keys.push({
        midi: baseMidi + semitone,
        semitone,
        white: false,
        rect: { x: Math.round(centre - blackW / 2), y: 0, width: blackW, height: blackH },
      });
    }
  }

  return keys;
}
