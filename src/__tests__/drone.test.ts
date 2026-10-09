import { describe, expect, it } from 'vitest';

import { applyScript, createSong, midiToNoteName, rowNotes, songToScript } from '../model';

/**
 * An open tuning, as an IDIOM rather than a feature.
 *
 * The genre plan (G2.5) proposed a per-channel alternate tuning — "a map from
 * string to offset, so a channel can drone open strings under moving shapes" —
 * and the honest answer turned out to be that a tracker cannot have one. There
 * are no strings here and no fretboard: a note IS its pitch, so there is nothing
 * for an offset to be relative to, and the same shape played in a different
 * tuning is simply different notes.
 *
 * What the player is actually after is reachable already, and this file is that
 * claim made mechanical: a channel WIDE enough to hold the open pitches and LONG
 * enough to let them ring (`poly` + `hold`) is an open-string drone under
 * whatever moves on the channel beside it. That is why G2.5 was closed by
 * correction rather than built — the plan's own rule 7 says a genre is a starter
 * (or an idiom) before it is a feature, and this one is an idiom.
 *
 * The test is here rather than in `chord.test.ts` because what it guards is the
 * REASONING, not an arithmetic: if a future change made a wide, long cell stop
 * holding several notes, the documented answer to "how do I do an open tuning"
 * would quietly stop working while every existing test still passed.
 */

/** FACGCE, low to high — the tuning the emo shelf is written around. */
const OPEN_STRINGS = [41, 45, 48, 55, 60, 64];

const OPEN_TEXT = OPEN_STRINGS.map(midiToNoteName).join(',');

/** The drone, the taps over it, and a bass: the three parts of the idiom. */
const DRONE_SCRIPT = `new
song "OPEN STRINGS"
key C major
tempo 96
tracks 3
track 1 "STRINGS" voice glass poly 6 hold 16 level 40
track 2 "TAPS"    voice pluck poly 3 hold 2 level 62
track 3 "BASS"    voice bass hold 4 level 68

pattern 1 "VERSE"
${OPEN_TEXT}    D-4,E-4,F-4    C-3
.               .              .
.               .              .
.               .              .
${OPEN_TEXT}    D-4,F-4,A-4    G-2
.               .              .
.               E-4,G-4,B-4    .
.               .              .
`;

function started(source: string) {
  const result = applyScript(createSong(), source);
  // The failing branch reports through an `expect` first, so a broken fixture
  // prints the parser's own sentence rather than a stack trace about `song`.
  if (!result.ok) expect(result.errors.map((error) => error.message).join('\n')).toBe('');
  if (!result.ok) throw new Error('the drone fixture did not apply');
  return result.song;
}

describe('the open-string drone, which is an idiom and not a feature', () => {
  it('sounds the whole tuning in one cell, on the channel that holds it', () => {
    const song = started(DRONE_SCRIPT);
    const at0 = rowNotes(song.patterns[0]!, 0);
    const drone = at0.filter((note) => note.track === 0);
    // Six pitches, in the order they were written: low F to high E.
    expect(drone.map((note) => note.midi)).toEqual(OPEN_STRINGS);
    // ...and the taps are on ANOTHER channel, which is the whole point: a drone
    // competes for voices with nothing when it has a channel of its own.
    expect(at0.filter((note) => note.track === 1).map((note) => note.midi)).toEqual([62, 64, 65]);
    // `C-3` is MIDI 48 here — this app's `C-0` is 12, so its `C-4` is 60, which is
    // the one line of arithmetic every pitch in the file goes through.
    expect(at0.filter((note) => note.track === 2).map((note) => note.midi)).toEqual([48]);
  });

  it('rings for as long as the channel says, which is what a hold is', () => {
    // The second half of the idiom: `hold 16` is why the drone sustains under the
    // moving shape at all. A hold of 1 would make it a stab, and the taps would
    // have nothing to sit over.
    const song = started(DRONE_SCRIPT);
    expect(song.tracks[0]!.hold).toBe(16);
    expect(song.tracks[1]!.hold).toBe(2);
    expect(song.tracks[0]!.poly).toBe(6);
    // Eight rows written is a BAR of sixteen steps, and a hold of sixteen is the
    // whole of it: the drone rings from the top of the bar to the bottom while
    // the taps move over it, which is what a player's open strings do.
    expect(song.patterns[0]!.steps.length).toBe(16);
  });

  it('is ordinary notation, so a saved script spells the tuning back out', () => {
    // Nothing about the idiom is special-cased: it is a cell, and a cell is what
    // `SONG` / `SAVE AS SCRIPT` writes.
    const song = started(DRONE_SCRIPT);
    const script = songToScript(song);
    // The writer's own order (`hold` before `poly`) and its own spelling of the
    // cell, because a save is a script a person reads back.
    expect(script).toContain('poly 6');
    expect(script).toContain('hold 16');
    expect(script).toContain(OPEN_TEXT);
    const again = started(script);
    expect(rowNotes(again.patterns[0]!, 0).map((note) => note.midi))
      .toEqual(rowNotes(song.patterns[0]!, 0).map((note) => note.midi));
  });

  it('needs the width, and says so — a tuning clause would not have been the missing half', () => {
    // The negative case, and the reason the plan's item was wrong: a channel that
    // sounds one note at a time cannot hold six, and the language already refuses
    // the cell and names the fix. No alternate-tuning statement would have made
    // this line work; `track 1 poly 6` does.
    const narrow = DRONE_SCRIPT.replace('poly 6 hold 16', 'hold 16');
    const result = applyScript(createSong(), narrow);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain('poly 6');
  });
});
