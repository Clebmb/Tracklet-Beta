import { describe, expect, it } from 'vitest';

import {
  applyScript,
  clampHumanize,
  createSong,
  DEFAULT_HUMANIZE,
  FEEL_SONG_FILE_VERSION,
  grooveFeel,
  HUMANIZE_STEP,
  MAX_HUMANIZE,
  MIN_HUMANIZE,
  ROWS_PER_BEAT,
  songFromJson,
  songToJson,
  songToScript,
  SONG_FILE_VERSION,
  trackFeel,
} from '../model';
import { scriptCapabilities } from '../model/capabilities';

/**
 * A part's own pocket: `track 4 groove shuffle` and `track 4 humanize 40`.
 *
 * Two promises are worth reading twice. First, a song where no channel has an
 * opinion is UNCHANGED — every file keeps its bytes and every note keeps its
 * place, which is what makes this additive rather than a re-performance of
 * several hundred songs. Second, the engine and the renderer ask the SAME
 * function (`trackFeel`), because a part whose feel differed between what you
 * heard and what you exported would be the worst kind of bug in a music app.
 */

/** A track's feel fields, which is all `trackFeel` reads. */
function feels(groove: Parameters<typeof trackFeel>[0]['groove'] = null, humanize = DEFAULT_HUMANIZE) {
  return { groove, humanize };
}

describe('a channel with no opinion is played exactly as before', () => {
  it('gives back the song feel, number for number', () => {
    for (const groove of ['straight', 'backbeat', 'shuffle', 'laid-back', 'pushed', 'human'] as const) {
      for (const step of [0, 1, 3, 7, 15]) {
        const song = grooveFeel(groove, step, ROWS_PER_BEAT);
        const part = trackFeel(feels(), groove, step, ROWS_PER_BEAT, 0);
        // Not merely equal — the same numbers, because the delay and the gain are
        // what the scheduler and the renderer both read.
        expect(part.delay).toBe(song.delay);
        expect(part.gain).toBe(song.gain);
      }
    }
  });

  it('changes none of the bytes of a song that never sets one', () => {
    const plain = createSong();
    expect(plain.tracks.every((track) => track.groove === null)).toBe(true);
    expect(plain.tracks.every((track) => track.humanize === DEFAULT_HUMANIZE)).toBe(true);
    const raw = JSON.parse(songToJson(plain)) as Record<string, unknown>;
    expect(raw.version).toBe(SONG_FILE_VERSION);
    expect(JSON.stringify(raw)).not.toContain('groove');
    expect(songToScript(plain)).not.toContain('humanize');
  });
});

describe('a part may have a feel of its own', () => {
  it('overrides the song without touching it', () => {
    // A straight song with one shuffled part: the song's own groove is untouched,
    // and the two channels disagree on purpose.
    // Step 2 at four steps to the beat is the offbeat EIGHTH, which is the one a
    // shuffle moves — so this is the step the feel is about.
    const shuffling = trackFeel(feels('shuffle'), 'straight', 2, ROWS_PER_BEAT, 4);
    const straight = trackFeel(feels(), 'straight', 2, ROWS_PER_BEAT, 0);
    expect(straight.delay).toBe(0);
    expect(shuffling.delay).toBeGreaterThan(0);
    // And a part can be deliberately straight in a song that leans.
    const held = trackFeel(feels('straight'), 'shuffle', 2, ROWS_PER_BEAT, 0);
    expect(held.delay).toBe(0);
    expect(held.gain).toBe(1);
  });

  it('humanises by an amount, and never more than a feel is allowed to lean', () => {
    const soft = trackFeel(feels(null, 30), 'straight', 5, ROWS_PER_BEAT, 1);
    const hard = trackFeel(feels(null, 100), 'straight', 5, ROWS_PER_BEAT, 1);
    // A wobble is a wobble: it moves the note, and it never makes one LOUDER than
    // it was written.
    expect(Math.abs(soft.delay)).toBeGreaterThan(0);
    expect(soft.gain).toBeLessThanOrEqual(1);
    expect(hard.gain).toBeLessThanOrEqual(1);
    // A hundred is a distinctly looser performance than thirty.
    expect(Math.abs(hard.delay)).toBeGreaterThan(Math.abs(soft.delay));
    // And even on top of the deepest feel, a note never arrives after the next one.
    const deep = trackFeel(feels('shuffle', 100), 'shuffle', 3, ROWS_PER_BEAT, 2);
    expect(Math.abs(deep.delay)).toBeLessThanOrEqual(0.75);
  });

  it('wobbles the same way every time, and differently per channel', () => {
    const once = trackFeel(feels(null, 60), 'straight', 9, ROWS_PER_BEAT, 2);
    const again = trackFeel(feels(null, 60), 'straight', 9, ROWS_PER_BEAT, 2);
    expect(again).toEqual(once);
    // Two humanised parts that wobbled identically would sound like one part with
    // a chorus, so the seed includes the channel.
    const other = trackFeel(feels(null, 60), 'straight', 9, ROWS_PER_BEAT, 3);
    expect(other).not.toEqual(once);
    // And the same step wobbles the same way in every bar, because it is a hash of
    // the position rather than a sequence.
    expect(trackFeel(feels(null, 60), 'straight', 9 + 16, ROWS_PER_BEAT, 2).delay)
      .not.toBe(once.delay);
  });

  it('clamps a humanize amount into the range the control offers', () => {
    expect(clampHumanize(-20)).toBe(MIN_HUMANIZE);
    expect(clampHumanize(400)).toBe(MAX_HUMANIZE);
    expect(clampHumanize(Number.NaN)).toBe(DEFAULT_HUMANIZE);
    expect(clampHumanize(41.4)).toBe(41);
    expect(HUMANIZE_STEP).toBeGreaterThan(0);
  });
});

describe('the words on a track line', () => {
  const track = (line: string) => {
    const result = applyScript(createSong(), `new\ntracks 4\n${line}`);
    if (!result.ok) throw new Error(`${line} -> ${result.errors.map((e) => e.message).join(' | ')}`);
    return result.song.tracks;
  };

  it('sets a feel and an amount, and leaves the rest of the channel alone', () => {
    const tracks = track('track 2 "HAT" groove shuffle humanize 40');
    expect(tracks[1].groove).toBe('shuffle');
    expect(tracks[1].humanize).toBe(40);
    // The song's own feel is not touched: a part's pocket is not a song setting.
    expect(tracks[0].groove).toBeNull();
    expect(tracks[0].humanize).toBe(DEFAULT_HUMANIZE);
  });

  it('takes a feel by any of its names', () => {
    expect(track('track 1 groove lazy')[0].groove).toBe('laid-back');
    expect(track('track 1 groove triplet')[0].groove).toBe('shuffle');
    // `none` rather than `off`, because `off` is a mute flag in this position —
    // the same collision `level` and `duck` already live with.
    expect(track('track 1 groove none')[0].groove).toBe('straight');
  });

  it('refuses a feel it does not know, and an amount out of range', () => {
    const badFeel = applyScript(createSong(), 'new\ntracks 2\ntrack 1 groove funky');
    expect(badFeel.ok).toBe(false);
    if (!badFeel.ok) expect(badFeel.errors[0].message).toContain('is not a feel');

    const badAmount = applyScript(createSong(), 'new\ntracks 2\ntrack 1 humanize 150');
    expect(badAmount.ok).toBe(false);
    if (!badAmount.ok) expect(badAmount.errors[0].message).toContain('is a machine');

    // Both are SETTING words, so a channel genuinely called GROOVE has to be
    // quoted — the same rule `duck` and `level` follow.
    const named = applyScript(createSong(), 'new\ntracks 2\ntrack 1 "GROOVE" wave sine');
    expect(named.ok).toBe(true);
    if (named.ok) expect(named.song.tracks[0].name).toBe('GROOVE');
  });

  it('clears with `new` like every other channel setting', () => {
    const shaped = applyScript(createSong(), 'new\ntracks 2\ntrack 1 groove pushed humanize 50');
    expect(shaped.ok).toBe(true);
    if (!shaped.ok) return;
    const fresh = applyScript(shaped.song, 'new\ntracks 2');
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(fresh.song.tracks[0].groove).toBeNull();
    expect(fresh.song.tracks[0].humanize).toBe(DEFAULT_HUMANIZE);
  });
});

describe('the file', () => {
  const shaped = () => {
    const result = applyScript(createSong(), 'new\ntracks 2\ntrack 1 "HAT" groove shuffle humanize 35\ntrack 2 "BASS" pattern 1\nC-4 .\n');
    if (!result.ok) throw new Error('fixture does not parse');
    return result.song;
  };

  it('declares version 19 when a part has a feel, and 12 when none does', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    expect(raw.version).toBe(SONG_FILE_VERSION);
    const file = songToJson(shaped());
    expect(file).toContain(`"version": ${FEEL_SONG_FILE_VERSION}`);
    expect(file).toContain('"groove": "shuffle"');
    expect(file).toContain('"humanize": 35');
    // A channel with no opinion says nothing at all, so the key is not there.
    expect(file).not.toContain('"groove": null');
  });

  it('round-trips through JSON and the script', () => {
    const song = shaped();
    const json = songToJson(song);
    const back = songFromJson(json);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.tracks[0].groove).toBe('shuffle');
    expect(back.song.tracks[0].humanize).toBe(35);
    expect(back.song.tracks[1].groove).toBeNull();
    expect(songToJson(back.song)).toBe(json);

    const script = songToScript(song);
    expect(script).toContain('groove shuffle');
    expect(script).toContain('humanize 35');
    const again = applyScript(createSong(), script);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.song.tracks[0].groove).toBe('shuffle');
    expect(again.song.tracks[0].humanize).toBe(35);
  });

  it('refuses a feel the app does not know, and clamps an amount out of range', () => {
    // A name is refused rather than dropped: falling back to the song's groove
    // would play something other than what the file asked for, silently.
    const raw = JSON.parse(songToJson(shaped())) as Record<string, unknown>;
    const tracks = structuredClone(raw.tracks) as Record<string, unknown>[];
    tracks[0]!.groove = 'funky';
    const refused = songFromJson(JSON.stringify({ ...raw, tracks }));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.errors.join(' ')).toContain('must be a feel');

    // A number is clamped, because a file that says 400 was written by something
    // that knew what it wanted and got the arithmetic wrong.
    const loud = structuredClone(raw.tracks) as Record<string, unknown>[];
    loud[0]!.humanize = 400;
    const clamped = songFromJson(JSON.stringify({ ...raw, tracks: loud }));
    expect(clamped.ok).toBe(true);
    if (clamped.ok) expect(clamped.song.tracks[0].humanize).toBe(MAX_HUMANIZE);
  });

  it('is published as a file version and an amount range', () => {
    const manifest = scriptCapabilities();
    expect(manifest.fileVersions.max).toBeGreaterThanOrEqual(FEEL_SONG_FILE_VERSION);
    expect(manifest.limits.humanize).toEqual({ min: MIN_HUMANIZE, max: MAX_HUMANIZE });
  });
});
