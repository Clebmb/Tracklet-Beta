import { describe, expect, it } from 'vitest';

import { createSong, setCellNotes, setPatternRows, type Song } from '../model';
import {
  cellText,
  clampLiveCursor,
  clipPreview,
  cycleClip,
  launchCountdown,
  LIVE_QUANTIZE_CHOICES,
  liveColumnCount,
  liveRowCount,
  moveLiveCursor,
  nextQuantize,
  patternStepCount,
  quantizeLabel,
  sceneCells,
} from '../ui/liveGrid';

/**
 * The launch grid's arithmetic: **the cursor is always on a real cell, cycling a
 * cell wraps through the song's own patterns and silence, and quantize steps
 * through the strip** — the small decisions a key press makes, checked without a
 * canvas.
 */

/** A song with `scenes` scenes and `channels` channels. */
function song(scenes = 2, channels = 4): Song {
  const s = createSong();
  setPatternRows(s, 16);
  while (s.tracks.length < channels) s.tracks.push(s.tracks[0]);
  while (s.scenes.length < scenes) {
    s.scenes.push({ name: `S${s.scenes.length + 1}`, clips: new Array(channels).fill(1) });
  }
  // Give the song some patterns so cycling has somewhere to go.
  while (s.patterns.length < 3) s.patterns.push(s.patterns[0]);
  return s;
}

describe('the cursor is always on a real cell', () => {
  it('counts at least one row and one column, so there is always a cursor', () => {
    const empty = createSong();
    expect(liveRowCount(empty)).toBe(1);
    expect(liveColumnCount(empty)).toBe(4);
  });

  it('clamps a cursor left over from a bigger song onto the grid', () => {
    const s = song(2, 4);
    expect(clampLiveCursor(s, { row: 9, col: 9 })).toEqual({ row: 1, col: 3 });
    expect(clampLiveCursor(s, { row: -3, col: -3 })).toEqual({ row: 0, col: 0 });
  });

  it('moves with WASD and wraps at both edges', () => {
    const s = song(3, 4);
    expect(moveLiveCursor(s, { row: 0, col: 0 }, -1, 0)).toEqual({ row: 2, col: 0 });
    expect(moveLiveCursor(s, { row: 2, col: 3 }, 1, 1)).toEqual({ row: 0, col: 0 });
    expect(moveLiveCursor(s, { row: 1, col: 1 }, 1, -1)).toEqual({ row: 2, col: 0 });
  });
});

describe('cycling a cell walks the song’s own patterns and silence', () => {
  it('goes silence -> 1 -> 2 -> ... -> last -> silence', () => {
    const s = song();
    // The song has 3 patterns, so the cycle is 4 stops.
    expect(cycleClip(s, null, 1)).toBe(1);
    expect(cycleClip(s, 1, 1)).toBe(2);
    expect(cycleClip(s, 3, 1)).toBeNull();
  });

  it('walks backwards too', () => {
    const s = song();
    expect(cycleClip(s, null, -1)).toBe(3);
    expect(cycleClip(s, 1, -1)).toBeNull();
  });

  it('reads a clip past the end of the patterns as silence, never as a wild number', () => {
    const s = song();
    expect(cycleClip(s, 60, 1)).toBe(1);
    expect(cycleClip(s, 0, 1)).toBe(1);
  });

  it('says a cell in three characters', () => {
    expect(cellText(null)).toBe('..');
    expect(cellText(3)).toBe('P3');
  });
});

describe('the grid reads a scene as a pattern per channel', () => {
  it('reads silence for a channel the scene does not reach', () => {
    const s = song(1, 4);
    s.scenes[0].clips = [1, null, 2, null];
    expect(sceneCells(s, 0)).toEqual([1, null, 2, null]);
  });

  it('reads the whole row as silence for a scene that does not exist', () => {
    const s = song(1, 4);
    expect(sceneCells(s, 99)).toEqual([null, null, null, null]);
  });
});

describe('the quantize strip steps through its choices', () => {
  it('offers the values the strip draws, in order', () => {
    expect([...LIVE_QUANTIZE_CHOICES]).toEqual([0, 1, 2, 4, 8, 16]);
  });

  it('cycles forward and back, wrapping at both ends', () => {
    expect(nextQuantize(1, 1)).toBe(2);
    expect(nextQuantize(16, 1)).toBe(0);
    expect(nextQuantize(0, -1)).toBe(16);
  });

  it('snaps a value that is not on the strip onto one that is', () => {
    expect(nextQuantize(3, 1)).toBe(2);
    expect(nextQuantize(3, -1)).toBe(0);
  });

  it('names the value as a person reads it', () => {
    expect(quantizeLabel(0)).toBe('NOW');
    expect(quantizeLabel(1)).toBe('1 BAR');
    expect(quantizeLabel(4)).toBe('4 BARS');
  });
});

describe('the launch countdown is the span the launch lands on', () => {
  it('counts beats inside the span, and how many a span holds', () => {
    // 1 bar of 16 steps at 4 rows per beat: 4 beats, and we start at beat 0.
    expect(launchCountdown(0, 1, 16, 4)).toEqual({ elapsed: 0, total: 4 });
    expect(launchCountdown(5, 1, 16, 4)).toEqual({ elapsed: 1, total: 4 });
    expect(launchCountdown(15, 1, 16, 4)).toEqual({ elapsed: 3, total: 4 });
  });

  it('goes silent for quantize NOW, which has no wait to count', () => {
    expect(launchCountdown(0, 0, 16, 4)).toBeNull();
  });

  it('rolls over each span as the transport passes a boundary', () => {
    // 2 bars: a span of 32 steps, so step 32 starts the count over at 0.
    expect(launchCountdown(32, 2, 16, 4)).toEqual({ elapsed: 0, total: 8 });
    expect(launchCountdown(39, 2, 16, 4)).toEqual({ elapsed: 1, total: 8 });
  });
});

describe('a clip preview reads the channel’s own column', () => {
  it('shows the notes that channel plays, by step and pitch', () => {
    const s = createSong();
    setPatternRows(s, 16);
    setCellNotes(s.patterns[0].steps[0][2], [64]);
    setCellNotes(s.patterns[0].steps[4][2], [67]);
    // Another channel's notes are not this channel's preview.
    setCellNotes(s.patterns[0].steps[2][0], [40]);
    expect(clipPreview(s, 1, 2)).toEqual([{ step: 0, pitch: 64 }, { step: 4, pitch: 67 }]);
    expect(clipPreview(s, 1, 0)).toEqual([{ step: 2, pitch: 40 }]);
  });

  it('is empty for a silent cell or a pattern the song does not have', () => {
    const s = createSong();
    expect(clipPreview(s, null, 0)).toEqual([]);
    expect(clipPreview(s, 60, 0)).toEqual([]);
    expect(patternStepCount(s, null)).toBe(0);
    expect(patternStepCount(s, 60)).toBe(0);
  });
});
