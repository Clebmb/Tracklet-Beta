import { describe, expect, it } from 'vitest';

import {
  applyScript,
  clampPoly,
  createSong,
  DEFAULT_POLY,
  MAX_POLY,
  MIN_POLY,
  POLY_SONG_FILE_VERSION,
  songFromJson,
  songToJson,
  songToScript,
  SONG_FILE_VERSION,
  voiceToSteal,
} from '../model';
import { scriptCapabilities } from '../model/capabilities';

/**
 * Polyphonic channels: `track 3 poly 6`.
 *
 * Two promises carry the whole feature. First, `poly 1` is the app's own history,
 * so a channel nobody has widened is played — and exported — exactly as it was.
 * Second, the stealing rule is one pure function the live engine and the offline
 * renderer both call, because a chord that lost a different note in a file than
 * it did in the app would be a bug nobody could hear until they compared the two.
 */

describe('how wide a channel may be', () => {
  it('is one note by default and eight at the most', () => {
    expect(DEFAULT_POLY).toBe(MIN_POLY);
    expect(MIN_POLY).toBe(1);
    expect(MAX_POLY).toBe(8);
    expect(clampPoly(0)).toBe(MIN_POLY);
    expect(clampPoly(99)).toBe(MAX_POLY);
    expect(clampPoly(Number.NaN)).toBe(DEFAULT_POLY);
    expect(clampPoly(4.4)).toBe(4);
    expect(clampPoly(1)).toBe(1);
  });
});

describe('which note gives way', () => {
  const note = (startedAt: number, velocity = 100) => ({ startedAt, velocity });

  it('steals the OLDEST first, because it has been heard longest', () => {
    // Later `startedAt` is newer, so the smallest is the oldest.
    expect(voiceToSteal([note(3), note(1), note(2)])).toBe(1);
    expect(voiceToSteal([note(1), note(2), note(3)])).toBe(0);
  });

  it('takes the QUIETEST when a chord began all at once', () => {
    // A step can hold a chord written by the `chord` tool, and those share a start.
    expect(voiceToSteal([note(5, 100), note(5, 40), note(5, 80)])).toBe(1);
  });

  it('prefers age over loudness, and breaks a full tie by position', () => {
    // An older quiet note still goes before a newer loud one: the rule is applied
    // in order rather than blended into a score.
    expect(voiceToSteal([note(1, 100), note(2, 10)])).toBe(0);
    expect(voiceToSteal([note(1, 50), note(1, 50), note(1, 50)])).toBe(0);
    expect(voiceToSteal([note(1)])).toBe(0);
    expect(voiceToSteal([])).toBe(-1);
  });
});

describe('the words on a track line', () => {
  const track = (line: string) => {
    const result = applyScript(createSong(), `new\ntracks 4\n${line}`);
    if (!result.ok) throw new Error(`${line} -> ${result.errors.map((e) => e.message).join(' | ')}`);
    return result.song.tracks;
  };

  it('widens one channel and leaves the others monophonic', () => {
    const tracks = track('track 3 "PIANO" poly 6');
    expect(tracks[2].poly).toBe(6);
    expect(tracks[0].poly).toBe(DEFAULT_POLY);
    expect(tracks[1].poly).toBe(DEFAULT_POLY);
  });

  it('refuses a width that is not a whole number of notes in range', () => {
    for (const bad of ['0', '12', '2.5', 'many']) {
      const result = applyScript(createSong(), `new\ntracks 4\ntrack 1 poly ${bad}`);
      expect(result.ok, bad).toBe(false);
      if (!result.ok) expect(result.errors[0].message).toContain('of notes at once');
    }
  });

  it('is a SETTING word, so a channel called POLY has to be quoted', () => {
    const named = applyScript(createSong(), 'new\ntracks 2\ntrack 1 "POLY" wave sine');
    expect(named.ok).toBe(true);
    if (named.ok) expect(named.song.tracks[0].name).toBe('POLY');
  });

  it('is cleared by `new` like every other channel setting', () => {
    const wide = applyScript(createSong(), 'new\ntracks 2\ntrack 1 poly 8');
    expect(wide.ok).toBe(true);
    if (!wide.ok) return;
    expect(wide.song.tracks[0].poly).toBe(8);
    const fresh = applyScript(wide.song, 'new\ntracks 2');
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(fresh.song.tracks[0].poly).toBe(DEFAULT_POLY);
  });
});

describe('the file', () => {
  const wide = () => {
    const result = applyScript(createSong(), 'new\ntracks 2\ntrack 1 "PAD" poly 4\npattern 1\nC-4 .\nE-4 .\nG-4 .\n');
    if (!result.ok) throw new Error('the poly fixture does not parse');
    return result.song;
  };

  it('declares version 20 when a channel is polyphonic, and 12 when none is', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    expect(raw.version).toBe(SONG_FILE_VERSION);
    expect(JSON.stringify(raw)).not.toContain('poly');
    const file = songToJson(wide());
    expect(file).toContain(`"version": ${POLY_SONG_FILE_VERSION}`);
    expect(file).toContain('"poly": 4');
    // A channel that holds one note at a time says nothing at all.
    expect(file).not.toContain('"poly": 1');
  });

  it('round-trips through JSON and the script', () => {
    const song = wide();
    const json = songToJson(song);
    const back = songFromJson(json);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.tracks[0].poly).toBe(4);
    expect(back.song.tracks[1].poly).toBe(DEFAULT_POLY);
    expect(songToJson(back.song)).toBe(json);

    const script = songToScript(song);
    expect(script).toContain('poly 4');
    const again = applyScript(createSong(), script);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.song.tracks[0].poly).toBe(4);
  });

  it('refuses a width that is not a number, and clamps one out of range', () => {
    const raw = JSON.parse(songToJson(wide())) as Record<string, unknown>;
    const tracks = structuredClone(raw.tracks) as Record<string, unknown>[];

    const text = structuredClone(tracks);
    text[0]!.poly = 'four';
    const refused = songFromJson(JSON.stringify({ ...raw, tracks: text }));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.errors.join(' ')).toContain('"poly" must be a whole number');

    // Out of range is clamped rather than refused, like every other number here.
    const loud = structuredClone(tracks);
    loud[0]!.poly = 99;
    const clamped = songFromJson(JSON.stringify({ ...raw, tracks: loud }));
    expect(clamped.ok).toBe(true);
    if (clamped.ok) expect(clamped.song.tracks[0].poly).toBe(MAX_POLY);
  });

  it('is published as a limit and a file version', () => {
    const manifest = scriptCapabilities();
    expect(manifest.limits.poly).toEqual({ min: MIN_POLY, max: MAX_POLY });
    expect(manifest.fileVersions.max).toBeGreaterThanOrEqual(POLY_SONG_FILE_VERSION);
  });
});
