import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  GENRES,
  kitById,
  NO_SAMPLE_WORD,
  patchForTrack,
  sameSampleName,
  type Song,
} from '../model';

/**
 * THE SHELF'S SAMPLE-FREE PROMISE — G7.3 of `ROADMAP-GENRES.md`.
 *
 * `ROADMAP-GENRES.md` rule 6 says a new sound in this plan is made out of
 * arithmetic or it is not made: no starter may lean on a recording, a soundfont or
 * a kit of your own. That is a strong claim about nine songs, and prose cannot
 * hold it — this guard does. It is the machine-checkable half of the rule, and it
 * fails the day somebody writes `start vaporwave` on top of a `.wav`.
 *
 * There are exactly four ways a song can reach for an import, and each is a
 * different door in the language:
 *
 *   1. a channel on `wave sample` or `wave font` — the imported wave itself, at
 *      the voice OR on any layer of its stack;
 *   2. a channel that NAMES a recording (`track 2 "HOOK" sample BRK`);
 *   3. a `kit` that is not one of the six this app ships (a kit of your own);
 *   4. a STATEMENT that opens a door without changing the song — `sample load
 *      "…"`, `instrument load "…"`, `instrument use 1` — which a started song
 *      would inherit as provenance even though its own bytes look clean.
 *
 * The four helpers below read each door, and the first test runs all four over the
 * whole shelf. The second is a guard on the guard: it doctors one starter four
 * ways and checks each door really trips, so a helper that silently stopped
 * matching cannot pass by returning an empty list forever.
 */

/** The waves that ARE an import: a recording, and a sampled instrument. */
const IMPORTED_WAVES: readonly string[] = ['sample', 'font'];

/** Every wave in a song that names an import, voice and stack layers alike. */
function importedWavesIn(song: Song): string[] {
  const found: string[] = [];
  for (const track of song.tracks) {
    for (const layer of patchForTrack(track).layers) {
      if (IMPORTED_WAVES.includes(layer.wave)) found.push(layer.wave);
    }
  }
  return found;
}

/** Every channel that names a recording, which is a reference to a file the app holds. */
function namedSamplesIn(song: Song): string[] {
  return song.tracks
    .map((track) => track.sample)
    .filter((name): name is string => name !== null && !sameSampleName(name, NO_SAMPLE_WORD));
}

/** The song's kit, when it is one of your own rather than one of the six this app ships. */
function userKitsIn(song: Song): string[] {
  return kitById(song.kit) === null ? [song.kit] : [];
}

/** The statements, comments and blanks removed — the words, not the prose about them. */
function statementsOf(script: string): string[] {
  return script
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)#.*$/, '').trim())
    .filter((line) => line !== '');
}

/** The statements that open a sample or soundfont door, by their leading word. */
function importStatementsIn(script: string): string[] {
  return statementsOf(script).filter((line) => /^(sample|instrument)\b/.test(line));
}

/** The song a bare `start NAME` makes, insisting it parsed. */
function started(id: string): Song {
  const genre = GENRES.find((one) => one.id === id);
  if (!genre) throw new Error(`no starter named ${id}`);
  const result = applyScript(createSong(), genre.script);
  if (!result.ok) throw new Error(`${id}: ${result.errors.map((error) => error.message).join(' | ')}`);
  return result.song;
}

describe('the shelf keeps its sample-free promise', () => {
  it('opens none of the four doors, on any starter', () => {
    for (const genre of GENRES) {
      const song = started(genre.id);
      expect(importedWavesIn(song), `${genre.id} plays an imported wave`).toEqual([]);
      expect(namedSamplesIn(song), `${genre.id} names a recording`).toEqual([]);
      expect(userKitsIn(song), `${genre.id} plays a kit of its own`).toEqual([]);
      expect(importStatementsIn(genre.script), `${genre.id} imports something`).toEqual([]);
    }
  });

  it('would catch a starter that leaned on an import', () => {
    // The guard on the guard. Each door is opened on purpose, and each has to
    // trip: a helper that quietly stopped matching would return `[]` above and
    // pass, which is the failure mode a guard file like this one must not have.
    const rock = applyScript(createSong(), GENRES.find((genre) => genre.id === 'rock')!.script);
    expect(rock.ok).toBe(true);
    if (!rock.ok) return;

    const sampleWave = applyScript(rock.song, 'track 1 wave sample');
    expect(sampleWave.ok).toBe(true);
    if (sampleWave.ok) expect(importedWavesIn(sampleWave.song)).toEqual(['sample']);

    const fontLayer = applyScript(rock.song, 'layer 1 2 wave font');
    expect(fontLayer.ok).toBe(true);
    if (fontLayer.ok) expect(importedWavesIn(fontLayer.song)).toEqual(['font']);

    const named = applyScript(rock.song, 'track 1 sample BRK02');
    expect(named.ok).toBe(true);
    if (named.ok) expect(namedSamplesIn(named.song)).toEqual(['BRK02']);

    const ownKit = applyScript(rock.song, 'kit MYHOUSE');
    expect(ownKit.ok).toBe(true);
    if (ownKit.ok) expect(userKitsIn(ownKit.song)).toEqual(['MYHOUSE']);

    expect(importStatementsIn('sample load "samples/break.wav"')).toEqual(['sample load "samples/break.wav"']);
    expect(importStatementsIn('instrument use 1')).toEqual(['instrument use 1']);
    // ...and a starter that only MENTIONS a sample in a comment is not flagged,
    // which is what keeps `start house`'s prose about a record somebody sampled.
    expect(importStatementsIn('# a record somebody sampled\nnew')).toEqual([]);
  });
});
