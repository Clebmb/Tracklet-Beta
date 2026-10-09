import { describe, expect, it } from 'vitest';

import {
  applyScript,
  cellNotes,
  countNotes,
  countSongNotes,
  createSong,
  GENRES,
  isInKey,
  MAX_LEVEL,
  MAX_PAN,
  MAX_VELOCITY,
  MIN_LEVEL,
  MIN_PAN,
  MIN_VELOCITY,
  usedTracks,
  type Song,
} from '../model';

/**
 * THE GENRE SHELF, AS PROPERTIES — G7.2 of `ROADMAP-GENRES.md`.
 *
 * `genre.test.ts` proves each starter is a well-formed SONG: it parses, has a
 * form, a loop and four-plus named channels, round-trips through both formats, and
 * is distinct from its neighbours. It cannot say whether a starter is a RECORD —
 * whether it sounds like anything — because that is taste, and taste is not a
 * build assertion. What it CAN say is the machine-checkable half of a record: the
 * properties `ROADMAP.md` §6 lists, run over the whole shelf.
 *
 * These are the things that are true of a song somebody actually played and false
 * of a skeleton nobody finished:
 *
 *   - it parses and makes a sound (nothing silent by accident);
 *   - every channel it declares is used, and none is muted to nothing;
 *   - every note is inside the range the controls offer, and none is silent;
 *   - the key it says it is in is the key the notes are mostly in;
 *   - no channel is a wall of sound by accident;
 *   - the arrangement only points at patterns that exist, and plays every one.
 *
 * The point of a guard like this is not to enforce a style. It is to fail the day
 * an edit leaves a channel unused, a note silent, a section orphaned or a pattern
 * dead — the four mistakes that turn "a starter" into "a starter that LOOKS fine".
 * Each property below states what it checks and, where the shelf deliberately
 * bends it, that too.
 */

/** The song a bare `start NAME` makes, insisting it parsed. */
function started(id: string): Song {
  const genre = GENRES.find((one) => one.id === id);
  if (!genre) throw new Error(`no starter named ${id}`);
  const result = applyScript(createSong(), genre.script);
  if (!result.ok) throw new Error(`${id}: ${result.errors.map((error) => error.message).join(' | ')}`);
  return result.song;
}

/** Every note-carrying cell in a starter: its channel, pitch (null for a drum) and velocity. */
function cells(song: Song): { track: number; midi: number; drum: boolean; velocity: number }[] {
  const out: { track: number; midi: number; drum: boolean; velocity: number }[] = [];
  for (const pattern of song.patterns) {
    for (const row of pattern.steps) {
      row.forEach((cell, track) => {
        if (cell.note === null) return;
        for (const midi of cellNotes(cell)) {
          out.push({ track, midi, drum: cell.drum !== null, velocity: cell.velocity });
        }
      });
    }
  }
  return out;
}

describe('the genre shelf, as properties', () => {
  it('parses and is audible, which is the floor a starter must clear', () => {
    for (const genre of GENRES) {
      const song = started(genre.id);
      expect(countSongNotes(song), genre.id).toBeGreaterThan(0);
      // Every pattern carries at least one note: a pattern the arrangement plays
      // but that holds nothing is a dead bar, and a starter is not allowed one.
      for (const pattern of song.patterns) {
        expect(countNotes(pattern), `${genre.id}/${pattern.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('uses every channel it declares', () => {
    for (const genre of GENRES) {
      const song = started(genre.id);
      const used = usedTracks(song);
      song.tracks.forEach((track, index) => {
        expect(used[index], `${genre.id} never uses ${track.name}`).toBe(true);
      });
    }
  });

  it('names every channel and leaves none muted to nothing', () => {
    for (const genre of GENRES) {
      const song = started(genre.id);
      for (const track of song.tracks) {
        expect(track.name, genre.id).not.toBe('');
        // A channel at level 0 is silent however much it plays — the quietest a
        // starter may be is not silent at all. (`lofi`'s hat is 28, the lowest in
        // the shelf; the bound is the control's own, plus "above zero".)
        expect(track.level, `${genre.id}/${track.name}`).toBeGreaterThan(MIN_LEVEL);
        expect(track.level, `${genre.id}/${track.name}`).toBeLessThanOrEqual(MAX_LEVEL);
        expect(track.pan, `${genre.id}/${track.name}`).toBeGreaterThanOrEqual(MIN_PAN);
        expect(track.pan, `${genre.id}/${track.name}`).toBeLessThanOrEqual(MAX_PAN);
      }
    }
  });

  it('writes every note inside the velocity range, and never a silent one', () => {
    for (const genre of GENRES) {
      for (const cell of cells(started(genre.id))) {
        expect(cell.velocity, genre.id).toBeGreaterThanOrEqual(MIN_VELOCITY);
        expect(cell.velocity, genre.id).toBeLessThanOrEqual(MAX_VELOCITY);
        // A note written at zero is a note that cannot be heard — a starter would
        // have left it out rather than write it, so its presence is a mistake.
        expect(cell.velocity, genre.id).toBeGreaterThan(0);
      }
    }
  });

  it('is mostly in the key it declares, so the key is a claim and not a wish', () => {
    // A genre may BORROW a note — `vaporwave` and `shoegaze` each step outside
    // their scales once, on purpose — but the overwhelming majority of a starter's
    // pitches sit in the key it names. Nine in ten is the line: below it, the key
    // is not describing the song, and a person reading `key A minor` would be
    // misled. Drums are excluded, because a kick has no key.
    for (const genre of GENRES) {
      const song = started(genre.id);
      const pitched = cells(song).filter((cell) => !cell.drum);
      expect(pitched.length, genre.id).toBeGreaterThan(0);
      const inKey = pitched.filter((cell) => isInKey(cell.midi, song.key)).length;
      const ratio = inKey / pitched.length;
      expect(ratio, `${genre.id}: ${inKey}/${pitched.length} in ${song.key.tonic} ${song.key.scale}`).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('is not a wall of sound by accident', () => {
    // A channel that sounds on EVERY step is only honest if it is a HELD layer: a
    // `hold` rings each note across steps, so a filled bar is a sustained texture.
    // `emo`'s tapped arp (`hold 4`) and `synthwave`'s arp (`hold 2`) are the two
    // channels in the shelf that never rest, and both earn it. A channel with
    // `hold 1` filling every step would be a machine-gun wall — the sound of a
    // figure pasted to the edge rather than played — and this fails it.
    for (const genre of GENRES) {
      const song = started(genre.id);
      song.tracks.forEach((track, index) => {
        let sounds = 0;
        let steps = 0;
        for (const pattern of song.patterns) {
          for (const row of pattern.steps) {
            const cell = row[index];
            if (!cell) continue;
            steps += 1;
            if (cell.note !== null) sounds += 1;
          }
        }
        const continuous = steps > 0 && sounds === steps;
        if (continuous) {
          expect(track.hold, `${genre.id}/${track.name} fills every step at hold ${track.hold}`).toBeGreaterThanOrEqual(2);
        }
      });
    }
  });

  it('arranges only patterns that exist, and plays every one of them', () => {
    for (const genre of GENRES) {
      const song = started(genre.id);
      const count = song.patterns.length;
      const played = new Set<number>();
      for (const entry of song.order) {
        expect(entry, `${genre.id} arranges pattern ${entry} of ${count}`).toBeGreaterThanOrEqual(1);
        expect(entry, `${genre.id} arranges pattern ${entry} of ${count}`).toBeLessThanOrEqual(count);
        played.add(entry);
      }
      for (const section of song.sections) {
        for (const bar of section.bars) {
          expect(bar, `${genre.id}/${section.name} holds pattern ${bar} of ${count}`).toBeGreaterThanOrEqual(1);
          expect(bar, `${genre.id}/${section.name} holds pattern ${bar} of ${count}`).toBeLessThanOrEqual(count);
        }
      }
      // No orphan pattern: a pattern nothing ever plays is a bar that was written
      // and then lost, which no starter in the shelf is allowed to ship.
      for (let pattern = 1; pattern <= count; pattern += 1) {
        expect(played.has(pattern), `${genre.id} never plays pattern ${pattern}`).toBe(true);
      }
    }
  });
});
