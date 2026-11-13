import { describe, expect, it } from 'vitest';
import {
  applyScript,
  createSong,
  emptyCell,
  setCellDrum,
  setCellStop,
  songFromJson,
  songToJson,
  songToScript,
  type Cell,
} from '../model';

/**
 * Every cell field, checked against every writer that is supposed to carry it.
 *
 * This file exists because two bugs of the same shape shipped in one session: a
 * `pan` the file READER dropped, and a `late`/`seek`/`pan`/`fade` the script
 * WRITER dropped. Neither failed anything — the song simply played straighter
 * than it was written, and only a round trip could see it. Hand-writing one test
 * per field per writer does not scale, and the third bug is the one that gets
 * missed.
 *
 * So the fixtures do two things no hand-written test does:
 *
 *  1. they are typed `Required<Cell>`, so ADDING A FIELD TO `Cell` fails the
 *     typecheck until this file says what its value is;
 *  2. between them they move every field off its default, so a writer that drops
 *     one is caught rather than silently playing a plainer song.
 *
 * Three fixtures rather than one because the articulation grammar forbids some
 * combinations on purpose — a note slides OR scoops, and a flam is not a
 * stutter — so one cell cannot carry all of them without asking for something
 * the language refuses.
 */

/**
 * Every field of a `Cell`, spelled the way the MODEL spells "absent": the four
 * clauses are `undefined`, not `0`, because a cell that says nothing about its
 * timing has nothing to say. Set to `0` they would be compared against a loaded
 * cell that (correctly) has no field at all, and the fixtures would fail for the
 * wrong reason.
 */
const BLANK = {
  ...emptyCell(),
  late: undefined,
  start: undefined,
  pan: undefined,
  fade: undefined,
} satisfies Cell & Record<keyof Required<Cell>, unknown>;

/** A chord with all four clauses and a slide with repeats. */
const CHORD = {
  ...BLANK,
  note: 60,
  extra: [64, 67],
  velocity: 80,
  slide: true,
  stutter: 3,
  late: 2,
  start: 25,
  pan: -30,
  fade: 40,
} satisfies Cell & Record<keyof Required<Cell>, unknown>;

/** A single note with a flam and a scoop — the other branch of the grammar. */
const SCOOPED = {
  ...BLANK,
  note: 62,
  velocity: 90,
  grace: 1,
  bend: 2,
  pan: 40,
} satisfies Cell & Record<keyof Required<Cell>, unknown>;

/**
 * A drum hit, which takes the word path through both writers.
 *
 * Built through `setCellDrum` rather than spelled out, because a drum cell in a
 * real song carries the KIT'S PITCH in `note` — a hand-made `{ drum: 'kick',
 * note: null }` is a cell the app never produces, and testing it would prove
 * something about a song nobody can write.
 */
function drumCell(): Cell {
  const cell: Cell = { ...BLANK };
  setCellDrum(cell, 'kick');
  cell.velocity = 90;
  cell.late = 1;
  cell.pan = -20;
  return cell;
}

/**
 * A STOP: a word with no pitch at all.
 *
 * Deliberately carries NO clause: a stop has nothing to start, so a push, a
 * seek or a pan on one is a request the format cannot honour. What it must keep
 * is `gesture`, which is the field the writers are most likely to drop.
 */
function stopCell(): Cell {
  const cell: Cell = { ...BLANK };
  setCellStop(cell, 'off');
  return cell;
}

// These two are built by function, so the COMPILE-TIME completeness check lives on
// `BLANK` above, which is the literal every fixture spreads; what these add is the
// runtime half — a `drum` and a `gesture` that a writer must not drop.
const DRUM: Cell = drumCell();
const STOPPED: Cell = stopCell();

const FIXTURES = { chord: CHORD, scooped: SCOOPED, drum: DRUM, stopped: STOPPED };

/** A song holding one cell at pattern 1, row 0, channel 1. */
function songHolding(cell: Cell) {
  const song = createSong();
  song.tracks[0].poly = 8;
  song.patterns[0].steps[0][0] = { ...cell, extra: [...cell.extra] };
  return song;
}

describe('every writer carries every cell field', () => {
  it('moves every field off its default somewhere, so none can be dropped', () => {
    const untouched = Object.keys(BLANK).filter((key) => {
      const name = key as keyof Cell;
      return Object.values(FIXTURES).every(
        (fixture) => JSON.stringify(fixture[name]) === JSON.stringify(BLANK[name]),
      );
    });
    // A field no fixture moves is a field no test would notice a writer dropping.
    expect(untouched).toEqual([]);
  });

  for (const [name, cell] of Object.entries(FIXTURES)) {
    it(`survives the JSON file, out and back: ${name}`, () => {
      const back = songFromJson(songToJson(songHolding(cell)));
      if (!back.ok) throw new Error(back.errors.join('; '));
      expect(back.song.patterns[0].steps[0][0]).toEqual(cell);
    });

    it(`survives the script writer, out and back: ${name}`, () => {
      const back = applyScript(createSong(), songToScript(songHolding(cell)));
      if (!back.ok) throw new Error(back.errors[0].message);
      expect(back.song.patterns[0].steps[0][0]).toEqual(cell);
    });
  }
});
