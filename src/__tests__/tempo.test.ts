import { describe, expect, it } from 'vitest';

import { renderSeconds } from '../audio/render';
import {
  BPM_MAX,
  BPM_MIN,
  clampTempoSlot,
  createSong,
  MAX_ORDER,
  MAX_TEMPO_POINTS,
  patternRows,
  sortTempoMap,
  songTempos,
  songTempoAtSlot,
  tempoMapBpm,
  tempoPointLabel,
  withTempoPoint,
  withoutTempoPoint,
  type TempoPoint,
} from '../model/song';
import { applyScript } from '../model/script';
import { SONG_FILE_VERSION, songFromJson, songToJson, songToScript } from '../model/songfile';

/**
 * The tempo map, tested as the same promise every expression feature makes: a
 * song that says nothing about its tempo is played by exactly the arithmetic it
 * was played by before there was a map.
 *
 * So the first test is the identity — an empty map answers the song's own bpm at
 * every step — and the rest pin down the two things a person actually means, a
 * change ON a bar and a lean INTO one, plus the format's guarantee that the map
 * survives a trip through both files.
 */

function applied(source: string, song = createSong()) {
  const result = applyScript(song, source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

function refused(source: string, song = createSong()) {
  const result = applyScript(song, source);
  if (result.ok) throw new Error('expected the script to be refused, but it applied');
  return result;
}

/** A song long enough to have bars to change in. */
function songWithBars(bars: number) {
  const song = createSong();
  song.order = Array.from({ length: bars }, () => 1);
  return song;
}

describe('the tempo map: one tempo until it says otherwise', () => {
  it('is the song own bpm at every step when the map is empty', () => {
    const song = createSong();
    expect(song.tempoMap).toEqual([]);
    for (const step of [0, 1, 4, 7, 63, 4096]) {
      expect(tempoMapBpm(song.bpm, [], 4, step)).toBe(song.bpm);
    }
    expect(songTempos(song).every((bpm) => bpm === song.bpm)).toBe(true);
    // And the whole song is exactly the flat song the renderer would have made:
    // a map that says nothing is not a slow-down, it is the same music.
    expect(songTempos(song)).toEqual(Array.from({ length: songTempos(song).length }, () => song.bpm));
  });
});

describe('the tempo map: a step and a slide', () => {
  const PER_BAR = 4;

  it('holds the old tempo until the bar it changes on', () => {
    // Base 120, and 60 from bar 3 — a STEP. Bars 1 and 2 are still 120.
    const points: TempoPoint[] = [{ slot: 3, bpm: 60, slide: false }];
    for (const step of [0, 3, 7]) expect(tempoMapBpm(120, points, PER_BAR, step)).toBe(120);
    for (const step of [8, 9, 15, 64]) expect(tempoMapBpm(120, points, PER_BAR, step)).toBe(60);
  });

  it('leans evenly from the previous point when it slides', () => {
    // Base 120, sliding down to 60 BY bar 5. The arrival bar is 4, so the
    // halfway step is halfway between the two numbers: 90.
    const points: TempoPoint[] = [{ slot: 5, bpm: 60, slide: true }];
    expect(tempoMapBpm(120, points, PER_BAR, 0)).toBe(120);
    expect(tempoMapBpm(120, points, PER_BAR, 8)).toBe(90);
    // 71.25, rounded to a whole bpm like every tempo in the app.
    expect(tempoMapBpm(120, points, PER_BAR, 13)).toBe(71);
    // And from the arrival bar on it is simply the tempo it slid to.
    expect(tempoMapBpm(120, points, PER_BAR, 16)).toBe(60);
    expect(tempoMapBpm(120, points, PER_BAR, 63)).toBe(60);
  });

  it('treats a slide as the only point as a slow-down from bar 1', () => {
    // Nothing before it, so the previous tempo is the song's own bpm and the
    // lean starts at the very first step rather than jumping on some bar.
    const points: TempoPoint[] = [{ slot: 3, bpm: 60, slide: true }];
    expect(tempoMapBpm(120, points, PER_BAR, 0)).toBe(120);
    expect(tempoMapBpm(120, points, PER_BAR, 4)).toBe(90);
    expect(tempoMapBpm(120, points, PER_BAR, 8)).toBe(60);
  });

  it('resolves the whole arrangement, one tempo per step', () => {
    const song = songWithBars(3);
    song.tempoMap = [{ slot: 2, bpm: 60, slide: false }];
    const tempos = songTempos(song);
    expect(tempos.length).toBe(3 * patternRows(song));
    const perBar = patternRows(song);
    expect(tempos.slice(0, perBar).every((b) => b === song.bpm)).toBe(true);
    expect(tempos.slice(perBar).every((b) => b === 60)).toBe(true);
    // The bar-start helper agrees with the per-step answer.
    expect(songTempoAtSlot(song, 1)).toBe(song.bpm);
    expect(songTempoAtSlot(song, 2)).toBe(60);
  });
});

describe('the tempo map: sorting, clamping and one point per bar', () => {
  it('sorts by bar and keeps the later word on a bar', () => {
    const sorted = sortTempoMap([
      { slot: 5, bpm: 100, slide: false },
      { slot: 2, bpm: 90, slide: true },
    ]);
    expect(sorted.map((p) => p.slot)).toEqual([2, 5]);

    // A file is read top to bottom, and the last thing said about a bar wins.
    const deduped = sortTempoMap([
      { slot: 3, bpm: 100, slide: false },
      { slot: 3, bpm: 140, slide: true },
    ]);
    expect(deduped).toEqual([{ slot: 3, bpm: 140, slide: true }]);
  });

  it('clamps the bar into the arrangement and the tempo into range', () => {
    expect(clampTempoSlot(0)).toBe(1);
    expect(clampTempoSlot(-12)).toBe(1);
    expect(clampTempoSlot(9999)).toBe(MAX_ORDER);
    expect(clampTempoSlot(3.7)).toBe(4);

    const [point] = sortTempoMap([{ slot: 0, bpm: 400, slide: false }]);
    expect(point.slot).toBe(1);
    expect(point.bpm).toBe(BPM_MAX);
    const [low] = sortTempoMap([{ slot: 2, bpm: 5, slide: false }]);
    expect(low.bpm).toBe(BPM_MIN);
  });

  it('replaces or drops the point at a bar', () => {
    const base: TempoPoint[] = [{ slot: 4, bpm: 100, slide: false }];
    expect(withTempoPoint(base, { slot: 4, bpm: 155, slide: true })).toEqual([
      { slot: 4, bpm: 155, slide: true },
    ]);
    expect(withTempoPoint(base, { slot: 6, bpm: 80, slide: false })).toEqual([
      { slot: 4, bpm: 100, slide: false },
      { slot: 6, bpm: 80, slide: false },
    ]);
    expect(withoutTempoPoint(base, 4)).toEqual([]);
  });

  it('spells a point the way the script and the app do', () => {
    expect(tempoPointLabel({ slot: 5, bpm: 140, slide: false })).toBe('140 AT 5');
    expect(tempoPointLabel({ slot: 9, bpm: 90, slide: true })).toBe('90 BY 9');
  });
});

describe('the tempo map in the script language', () => {
  it('reads a step and a slide, by bar', () => {
    const { song } = applied('tempo 140\ntempo 140 at 5\ntempo 90 by 9');
    expect(song.bpm).toBe(140);
    expect(song.tempoMap).toEqual([
      { slot: 5, bpm: 140, slide: false },
      { slot: 9, bpm: 90, slide: true },
    ]);
  });

  it('counts by BAR, so saying a bar twice is a change of mind', () => {
    const { song } = applied('tempo 100 at 5\ntempo 120 at 5');
    expect(song.tempoMap).toEqual([{ slot: 5, bpm: 120, slide: false }]);
  });

  it('refuses a bar it cannot reach, a word it does not know, and a wall of them', () => {
    expect(refused('tempo 140 at 0').errors[0].message).toMatch(/1\.\.\d+/);
    expect(refused('tempo 140 at 999').errors[0].message).toMatch(/1\.\.\d+/);
    expect(refused('tempo 140 in 5').errors[0].message).toMatch(/at.*by/i);

    const many = Array.from({ length: MAX_TEMPO_POINTS + 1 }, (_, i) => `tempo ${100 + i} at ${i + 1}`).join('\n');
    const refusedMany = refused(many);
    expect(refusedMany.errors.some((e) => e.message.includes(`at most ${MAX_TEMPO_POINTS}`))).toBe(true);
  });

  it('forgets the map when the script starts a new song', () => {
    const first = applied('tempo 90 by 9', songWithBars(10));
    expect(first.song.tempoMap.length).toBe(1);
    const second = applied('new\ntempo 100', first.song);
    expect(second.song.tempoMap).toEqual([]);
    expect(second.song.bpm).toBe(100);
  });
});

describe('the tempo map travels in both files', () => {
  function mappedSong() {
    const song = songWithBars(4);
    song.bpm = 120;
    song.tempoMap = [
      { slot: 5, bpm: 140, slide: false },
      { slot: 9, bpm: 60, slide: true },
    ];
    return song;
  }

  it('writes and reads the map as JSON, at the current version', () => {
    const json = songToJson(mappedSong());
    expect(JSON.parse(json).version).toBe(SONG_FILE_VERSION);
    expect(SONG_FILE_VERSION).toBeGreaterThanOrEqual(8);
    expect(JSON.parse(json).tempoMap).toEqual([
      { slot: 5, bpm: 140, slide: false },
      { slot: 9, bpm: 60, slide: true },
    ]);
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tempoMap).toEqual([
      { slot: 5, bpm: 140, slide: false },
      { slot: 9, bpm: 60, slide: true },
    ]);
  });

  it('leaves the map out of a flat song, so it stays the file it always was', () => {
    const json = songToJson(createSong());
    expect(JSON.parse(json).tempoMap).toBeUndefined();
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tempoMap).toEqual([]);
  });

  it('reads an old file with no map as one tempo throughout', () => {
    const file = JSON.parse(songToJson(mappedSong())) as Record<string, unknown>;
    delete file.tempoMap;
    file.version = 7;
    const parsed = songFromJson(JSON.stringify(file));
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tempoMap).toEqual([]);
  });

  it('clamps a tempo written with bad arithmetic, and refuses a malformed point', () => {
    const clamped = JSON.parse(songToJson(mappedSong())) as Record<string, unknown>;
    clamped.tempoMap = [{ slot: 3, bpm: 400 }];
    const parsed = songFromJson(JSON.stringify(clamped));
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tempoMap).toEqual([{ slot: 3, bpm: BPM_MAX, slide: false }]);

    for (const broken of ['nope', [{ slot: 0, bpm: 100 }], [{ slot: 3 }], [{ slot: 3, bpm: 100, slide: 1 }]]) {
      const file = JSON.parse(songToJson(mappedSong())) as Record<string, unknown>;
      file.tempoMap = broken;
      const refusedFile = songFromJson(JSON.stringify(file));
      expect(refusedFile.ok, JSON.stringify(broken)).toBe(false);
    }
  });

  it('round-trips the map through the script too', () => {
    const script = songToScript(mappedSong());
    expect(script).toContain('tempo 140 at 5');
    expect(script).toContain('tempo 60 by 9');
    const parsed = applyScript(createSong(), script);
    if (!parsed.ok) throw new Error(parsed.errors.map((e) => e.message).join(' / '));
    expect(parsed.song.tempoMap).toEqual([
      { slot: 5, bpm: 140, slide: false },
      { slot: 9, bpm: 60, slide: true },
    ]);
  });
});

describe('the map reaches the sound', () => {
  it('makes a sliding arrangement longer than its flat twin', () => {
    const flat = songWithBars(4);
    const sliding = songWithBars(4);
    sliding.tempoMap = [{ slot: 5, bpm: 60, slide: true }];
    // A song that leans down takes longer to play than the same song at a held
    // tempo, which is the whole point of exporting with the map applied.
    expect(renderSeconds(sliding)).toBeGreaterThan(renderSeconds(flat));
  });
});
