import { describe, expect, it } from 'vitest';

import {
  applyScript,
  automatedLevel,
  clampNoteClockStep,
  createSong,
  laneClock,
  laneValueAt,
  MAX_NOTE_CLOCK_STEPS,
  noteClockCurve,
  NOTE_CLOCK_SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  songFromJson,
  songToJson,
  songToScript,
  supportsNoteClock,
  tidyLane,
  type AutomationLane,
  type Song,
} from '../model';

/**
 * A lane on the NOTE clock: steps since each hit, rather than bars of the song.
 *
 * Two things are worth proving apart. The walk is arithmetic and can be checked
 * exactly. The FILE is where a clock goes wrong quietly: an older build would read
 * `bars: [0, 6]` as bars of the order and drop the key that said otherwise, so the
 * version that goes with it is part of the feature rather than paperwork.
 *
 * What is NOT tested here is the audio graph itself — the engine and the renderer
 * pass steps-since-hit from their own bookkeeping, and this suite checks the
 * arithmetic they call, not the sound that comes out.
 */

function applied(source: string): Song {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.song;
}

function refused(source: string): string {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  return result.errors.map((error) => error.message).join(' ');
}

const LANE: AutomationLane = {
  track: 2, target: 'level', from: 80, to: 20, startBar: 0, endBar: 6, clock: 'note',
};

describe('the walk, counted from the hit', () => {
  it('starts on the hit and arrives on the last step of the range', () => {
    expect(laneValueAt(LANE, 999, 16, 0)).toBe(80);
    expect(laneValueAt(LANE, 999, 16, 6)).toBe(20);
    // Evenly between them: 80 -> 20 across seven steps is ten a step.
    expect(laneValueAt(LANE, 999, 16, 3)).toBe(50);
  });

  it('holds its arrival value after the range, like every lane', () => {
    expect(laneValueAt(LANE, 999, 16, 40)).toBe(20);
  });

  it('says nothing before the first step, or when there is no hit to count from', () => {
    const late: AutomationLane = { ...LANE, startBar: 2, endBar: 6 };
    expect(laneValueAt(late, 999, 16, 1)).toBe(null);
    expect(laneValueAt(LANE, 999, 16, null)).toBe(null);
  });

  it('ignores the song step and the bar length entirely', () => {
    expect(laneValueAt(LANE, 0, 16, 3)).toBe(laneValueAt(LANE, 512, 4, 3));
  });

  it('needs the range to be steps, and clamps it there', () => {
    expect(clampNoteClockStep(-4)).toBe(0);
    expect(clampNoteClockStep(999)).toBe(MAX_NOTE_CLOCK_STEPS);
    const wide = tidyLane({ ...LANE, startBar: 0, endBar: 9999 });
    expect(wide.endBar).toBe(MAX_NOTE_CLOCK_STEPS);
  });

  it('answers a level per note through the same reader the app uses', () => {
    const lanes = [LANE];
    expect(automatedLevel(lanes, 2, 100, 999, 16, 0)).toBe(80);
    expect(automatedLevel(lanes, 2, 100, 999, 16, 6)).toBe(20);
    // The channel's own level is what a channel with no hit yet plays.
    expect(automatedLevel(lanes, 3, 100, 999, 16, 0)).toBe(null);
  });
});

describe('the curve a note is built with', () => {
  it('is the lane read step by step, from the hit to its last step', () => {
    const song = applied('automate 2 bright 90 20 note 0 to 6');
    const points = noteClockCurve(song.automation, 2, 'bright');
    expect(points).toHaveLength(7);
    expect(points?.[0]).toEqual({ step: 0, value: 90 });
    expect(points?.[6]).toEqual({ step: 6, value: 20 });
  });

  it('is null for a channel no note-clock lane touches', () => {
    const song = applied('automate 2 bright 90 20 note 0 to 6');
    expect(noteClockCurve(song.automation, 3, 'bright')).toBe(null);
    expect(noteClockCurve(song.automation, 2, 'level')).toBe(null);
  });

  it('is null for a bar lane on the same knob, which is not a curve', () => {
    const song = applied('automate 2 bright 90 20 bars 1 to 4');
    expect(noteClockCurve(song.automation, 2, 'bright')).toBe(null);
  });
});

describe('what may ride it', () => {
  it('is level and bright, and nothing else', () => {
    expect(supportsNoteClock('level')).toBe(true);
    expect(supportsNoteClock('bright')).toBe(true);
    expect(supportsNoteClock('gate')).toBe(false);
    expect(supportsNoteClock('sweep')).toBe(false);
  });

  it('drops the clock from a target that cannot ride it, rather than keeping a lie', () => {
    const tidied = tidyLane({ ...LANE, target: 'gate' });
    expect(laneClock(tidied)).toBe('bars');
    expect(tidied.clock).toBeUndefined();
  });

  it('leaves a bar lane a bar lane, clock or no clock', () => {
    const tidied = tidyLane({ track: 1, target: 'level', from: 10, to: 90, startBar: 2, endBar: 5 });
    expect(laneClock(tidied)).toBe('bars');
    expect(tidied.clock).toBeUndefined();
  });
});

describe('the word', () => {
  it('takes `note` in the place `bars` goes', () => {
    const song = applied('automate 2 level 80 20 note 0 to 6');
    const lane = song.automation[0];
    expect(lane.clock).toBe('note');
    expect(lane.target).toBe('level');
    expect([lane.from, lane.to, lane.startBar, lane.endBar]).toEqual([80, 20, 0, 6]);
  });

  it('takes brightness, which is a filter the note can walk', () => {
    const song = applied('automate 2 bright 90 20 note 0 to 6');
    expect(song.automation[0].clock).toBe('note');
    expect(song.automation[0].target).toBe('bright');
  });

  it('refuses a knob the note cannot walk, and says why', () => {
    expect(refused('automate 2 gate 100 40 note 0 to 4')).toContain('cannot ride the note clock');
    expect(refused('automate 2 sweep 90 20 note 0 to 6')).toContain('cannot ride the note clock');
  });

  it('refuses a range longer than a note', () => {
    expect(refused('automate 2 level 90 20 note 0 to 200')).toContain('steps since a hit run 0..');
  });

  it('still refuses the range shapes it always did', () => {
    expect(refused('automate 2 level 90 20')).toContain('a lane needs the range it spans');
    expect(refused('automate 2 level 90 20 notes 0 to 6')).toContain('a lane needs the range it spans');
  });
});

describe('the file', () => {
  it('claims the newest version, and carries the clock', () => {
    const song = applied('automate 2 level 80 20 note 0 to 6');
    const json = JSON.parse(songToJson(song));
    expect(json.version).toBe(NOTE_CLOCK_SONG_FILE_VERSION);
    // The note clock is no longer the NEWEST version — keyzones (49) are — but it
    // is still a version this build reads and writes.
    expect(SONG_FILE_VERSION_MAX).toBeGreaterThanOrEqual(NOTE_CLOCK_SONG_FILE_VERSION);
    expect(json.automation[0]).toMatchObject({ clock: 'note', bars: [0, 6] });
    const back = songFromJson(JSON.stringify(json));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.song.automation[0].clock).toBe('note');
      expect(back.song.automation[0].endBar).toBe(6);
    }
  });

  it('writes no clock key for a lane that never asked for one', () => {
    const song = applied('automate 2 bright 15 95 bars 8 to 15');
    const json = JSON.parse(songToJson(song));
    expect(json.automation[0].clock).toBeUndefined();
    expect(json.version).toBeLessThan(NOTE_CLOCK_SONG_FILE_VERSION);
  });

  it('saves itself back as a `note` line rather than silently becoming a bar lane', () => {
    const song = applied('automate 2 level 80 20 note 0 to 6');
    const script = songToScript(song);
    expect(script).toContain('automate 2 level 80 20 note 0 to 6');
    const again = applied(script);
    expect(again.automation[0].clock).toBe('note');
  });

  it('refuses a clock that is neither, instead of guessing', () => {
    const json = JSON.parse(songToJson(applied('automate 2 level 80 20 note 0 to 6')));
    json.automation[0].clock = 'beats';
    const back = songFromJson(JSON.stringify(json));
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.errors.join(' ')).toContain('needs a "clock" of "bars"');
  });
});
