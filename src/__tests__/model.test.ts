import { describe, expect, it } from 'vitest';

import {
  advanceAfterWrite,
  addTrack,
  cellLabelAt,
  clampCursor,
  clampGlide,
  clampHold,
  clampRows,
  clampVelocity,
  clampVibrato,
  copyPattern,
  DEFAULT_GLIDE,
  DEFAULT_HOLD,
  DEFAULT_STUTTER,
  DEFAULT_VELOCITY,
  DEFAULT_VIBRATO,
  emptyCell,
  emptyTrack,
  EXPRESSION_STEP,
  glideLabel,
  MAX_GLIDE,
  MAX_VIBRATO,
  MIN_GLIDE,
  MIN_VIBRATO,
  vibratoLabel,
  HOLD_STEPS,
  MAX_HOLD,
  MAX_ROWS,
  MAX_VELOCITY,
  MIN_HOLD,
  MIN_VELOCITY,
  nextHold,
  stepVelocity,
  VELOCITY_STEP,
  velocityLabel,
  clearCell,
  clearPattern,
  countNotes,
  createSong,
  emptyPattern,
  isPatternEmpty,
  MIDI_MAX,
  MIDI_MIN,
  midiToFreq,
  clampSwing,
  DEFAULT_SWING,
  MAX_SWING,
  midiToNoteName,
  MIN_SWING,
  moveCursor,
  noteNameToMidi,
  PIANO_KEY_SEMITONES,
  removeTrack,
  reshape,
  rowNotes,
  secondsPerRow,
  stepTimeFactor,
  swingDepth,
  writeNote,
} from '../model';
import {
  BPM_MAX,
  BPM_MIN,
  clampBpm,
  DEFAULT_ROWS,
  DEFAULT_TRACKS,
  isSongTitleLength,
  isTrackNameLength,
  MAX_SONG_TITLE,
  MAX_TRACK_NAME,
  tidySongTitle,
  UNTITLED_TITLE,
  patternRows,
  setPatternRows,
  tidyTrackName,
} from '../model/song';
import { keyLabel } from '../model/notes';

describe('note naming', () => {
  it('names middle C the way a tracker does', () => {
    expect(midiToNoteName(60)).toBe('C-4');
    expect(midiToNoteName(61)).toBe('C#4');
    expect(midiToNoteName(69)).toBe('A-4');
    expect(midiToNoteName(12)).toBe('C-0');
  });

  it('always prints exactly three characters, so columns line up', () => {
    for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
      expect(midiToNoteName(midi)).toHaveLength(3);
    }
  });

  it('round-trips every note it can name', () => {
    for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
      expect(noteNameToMidi(midiToNoteName(midi))).toBe(midi);
    }
  });

  it('accepts loose spellings for hand-written patterns', () => {
    expect(noteNameToMidi('C4')).toBe(60);
    expect(noteNameToMidi('c#4')).toBe(61);
    expect(noteNameToMidi('Eb4')).toBe(63);
  });

  it('rejects text that is not a note', () => {
    expect(noteNameToMidi('')).toBeNull();
    expect(noteNameToMidi('H-4')).toBeNull();
    expect(noteNameToMidi('C-99')).toBeNull();
  });

  it('tunes A-4 to concert pitch', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
  });
});

describe('the keyboard piano', () => {
  it('covers two octaves from the two key rows', () => {
    expect(PIANO_KEY_SEMITONES.KeyZ).toBe(0);
    expect(PIANO_KEY_SEMITONES.KeyM).toBe(11);
    expect(PIANO_KEY_SEMITONES.KeyQ).toBe(12);
    expect(PIANO_KEY_SEMITONES.KeyU).toBe(23);
  });

  it('leaves the arrow keys free for navigation', () => {
    expect(PIANO_KEY_SEMITONES.ArrowUp).toBeUndefined();
    expect(PIANO_KEY_SEMITONES.ArrowDown).toBeUndefined();
  });

  it('labels a key code for the help card', () => {
    expect(keyLabel('KeyZ')).toBe('Z');
    expect(keyLabel('Digit2')).toBe('2');
  });
});

describe('song data', () => {
  it('starts as one empty pattern of named tracks', () => {
    const song = createSong();
    expect(song.tracks).toHaveLength(DEFAULT_TRACKS);
    expect(song.patterns).toHaveLength(1);
    expect(countNotes(song.patterns[0])).toBe(0);
    expect(isPatternEmpty(song.patterns[0])).toBe(true);
    expect(song.tracks[0].name).toBe('TRACK 1');
  });

  it('clocks a row from the tempo', () => {
    // 120 BPM, 4 rows to the beat => a beat is 0.5s, a row 0.125s.
    expect(secondsPerRow(120)).toBeCloseTo(0.125, 6);
    expect(secondsPerRow(60)).toBeCloseTo(0.25, 6);
  });

  it('clamps the tempo into the offered range', () => {
    expect(clampBpm(1)).toBe(BPM_MIN);
    expect(clampBpm(9999)).toBe(BPM_MAX);
    expect(clampBpm(128.4)).toBe(128);
  });

  it('keeps every pattern the same width as the track list', () => {
    const song = createSong();
    addTrack(song);
    expect(song.tracks).toHaveLength(DEFAULT_TRACKS + 1);
    for (const row of song.patterns[0].steps) expect(row).toHaveLength(DEFAULT_TRACKS + 1);

    removeTrack(song, 0);
    expect(song.tracks).toHaveLength(DEFAULT_TRACKS);
    for (const row of song.patterns[0].steps) expect(row).toHaveLength(DEFAULT_TRACKS);
  });

  it('always keeps at least one track', () => {
    const song = createSong();
    for (let i = 0; i < 10; i++) removeTrack(song, 0);
    expect(song.tracks).toHaveLength(1);
  });

  it('pads and trims a pattern that disagrees with the track list', () => {
    const song = createSong();
    song.tracks = [song.tracks[0], song.tracks[1]]; // two tracks...
    song.patterns = [emptyPattern('P', 4, 3)]; // ...but a three-wide pattern
    reshape(song);
    for (const row of song.patterns[0].steps) expect(row).toHaveLength(2);

    song.tracks.push(emptyTrack(2));
    song.patterns = [emptyPattern('P', 4, 1)]; // a one-wide pattern, two tracks
    reshape(song);
    for (const row of song.patterns[0].steps) expect(row).toHaveLength(3);
  });
});

describe('note length, a channel at a time', () => {
  it('starts every channel at one step, which is a note per step', () => {
    const song = createSong();
    expect(song.tracks.every((track) => track.hold === DEFAULT_HOLD)).toBe(true);
    expect(DEFAULT_HOLD).toBe(1);
  });

  it('cycles the lengths a channel can hold, and wraps', () => {
    expect(HOLD_STEPS).toEqual([1, 2, 4, 8, 16]);
    expect(nextHold(1)).toBe(2);
    expect(nextHold(2)).toBe(4);
    expect(nextHold(4)).toBe(8);
    expect(nextHold(8)).toBe(16);
    expect(nextHold(16)).toBe(1);
  });

  it('snaps a length that is not one of the offered ones', () => {
    // A hand-edited file can say `hold 3`; the control needs a way back into the
    // cycle from there rather than getting stuck off it.
    expect(nextHold(3)).toBe(4);
    expect(nextHold(0)).toBe(2);
    expect(nextHold(99)).toBe(1);
  });

  it('clamps a length into the range the model allows', () => {
    expect(clampHold(0)).toBe(MIN_HOLD);
    expect(clampHold(1000)).toBe(MAX_HOLD);
    expect(clampHold(7.6)).toBe(8);
  });
});

describe('channel names', () => {
  it('takes a name from the same place a script and the rename box do', () => {
    expect(tidyTrackName('  lead  ')).toBe('LEAD');
    expect(tidyTrackName('bass guitar')).toBe('BASS GUITAR');
  });

  it('refuses a name of nothing but spaces', () => {
    expect(tidyTrackName('   ')).toBe('');
  });

  it('caps a name at the limit, whether or not it was typed', () => {
    const long = 'a name that is far too long for a row';
    expect(tidyTrackName(long)).toHaveLength(MAX_TRACK_NAME);
    expect(isTrackNameLength('X'.repeat(MAX_TRACK_NAME))).toBe(true);
    expect(isTrackNameLength('X'.repeat(MAX_TRACK_NAME + 1))).toBe(false);
    // Trailing spaces do not count against a script's name.
    expect(isTrackNameLength(`  ${'X'.repeat(MAX_TRACK_NAME)}  `)).toBe(true);
  });
});

/**
 * The song title is the second editable name in the app, and it obeys the same
 * rules as a channel's — because the header's rename box, the script's `song`
 * line and the JSON reader all have to agree about what a title IS.
 */
describe('the song title', () => {
  it('is tidied the way a channel name is, because both are typed the same way', () => {
    expect(tidySongTitle('  midnight drive home ')).toBe('MIDNIGHT DRIVE HOME');
    expect(tidySongTitle('   ')).toBe('');
  });

  it('caps a title at the limit, whether or not it was typed', () => {
    expect(tidySongTitle('x'.repeat(80))).toHaveLength(MAX_SONG_TITLE);
    expect(isSongTitleLength('X'.repeat(MAX_SONG_TITLE))).toBe(true);
    expect(isSongTitleLength('X'.repeat(MAX_SONG_TITLE + 1))).toBe(false);
    expect(isSongTitleLength(`  ${'X'.repeat(MAX_SONG_TITLE)}  `)).toBe(true);
  });

  it('starts a new song with the title the rest of the app expects', () => {
    expect(createSong().title).toBe(UNTITLED_TITLE);
    expect(isSongTitleLength(UNTITLED_TITLE)).toBe(true);
  });

  it('gives the title more room than a channel name, but still a fixed amount', () => {
    // The header has one line and the channel rows have one column, so the two
    // limits are different numbers for the same reason: how much room there is.
    expect(MAX_SONG_TITLE).toBeGreaterThan(MAX_TRACK_NAME);
  });
});

describe('the pattern length', () => {
  it('starts at sixteen steps', () => {
    expect(patternRows(createSong())).toBe(DEFAULT_ROWS);
  });

  it('clamps a length into the supported range', () => {
    expect(clampRows(0)).toBe(1);
    expect(clampRows(9999)).toBe(MAX_ROWS);
    expect(clampRows(31.6)).toBe(32);
  });

  it('grows every pattern with empty steps, and keeps the notes it had', () => {
    const song = createSong();
    writeNote(song.patterns[0], 3, 1, 60);
    addTrack(song);
    addTrack(song);
    song.patterns.push(emptyPattern('SECOND', DEFAULT_ROWS, song.tracks.length));

    setPatternRows(song, 64);
    for (const pattern of song.patterns) {
      expect(pattern.steps).toHaveLength(64);
      for (const row of pattern.steps) expect(row).toHaveLength(song.tracks.length);
    }
    expect(song.patterns[0].steps[3][1].note).toBe(60);
    expect(patternRows(song)).toBe(64);
  });

  it('trims every pattern down, dropping only what is past the new end', () => {
    const song = createSong();
    setPatternRows(song, 64);
    writeNote(song.patterns[0], 60, 0, 72);
    writeNote(song.patterns[0], 1, 0, 60);

    setPatternRows(song, 16);
    expect(patternRows(song)).toBe(16);
    expect(song.patterns[0].steps[1][0].note).toBe(60);
    expect(countNotes(song.patterns[0])).toBe(1);
  });

  it('handles the 512-step ceiling', () => {
    const song = createSong();
    setPatternRows(song, MAX_ROWS);
    expect(patternRows(song)).toBe(MAX_ROWS);
    expect(song.patterns[0].steps[MAX_ROWS - 1]).toHaveLength(DEFAULT_TRACKS);
  });
});

describe('the editor cursor', () => {
  it('clamps to the grid', () => {
    const pattern = emptyPattern('P', 8, 2);
    expect(clampCursor({ row: 99, track: 99 }, pattern, 2)).toEqual({ row: 7, track: 1 });
    expect(clampCursor({ row: -5, track: -5 }, pattern, 2)).toEqual({ row: 0, track: 0 });
  });

  it('moves by a delta without leaving the grid', () => {
    const pattern = emptyPattern('P', 8, 2);
    expect(moveCursor({ row: 0, track: 0 }, -1, -1, pattern, 2)).toEqual({ row: 0, track: 0 });
    expect(moveCursor({ row: 3, track: 0 }, 2, 1, pattern, 2)).toEqual({ row: 5, track: 1 });
  });

  it('advances a row after a write, and stops at the last row', () => {
    const pattern = emptyPattern('P', 4, 1);
    expect(advanceAfterWrite({ row: 1, track: 0 }, pattern, 1)).toEqual({ row: 2, track: 0 });
    expect(advanceAfterWrite({ row: 3, track: 0 }, pattern, 1)).toEqual({ row: 3, track: 0 });
  });
});

describe('editing', () => {
  it('writes, reads and clears a cell', () => {
    const pattern = emptyPattern('P', 4, 2);
    expect(cellLabelAt(pattern, 1, 1)).toBe('...');
    expect(writeNote(pattern, 1, 1, 60)).toBe(true);
    expect(cellLabelAt(pattern, 1, 1)).toBe('C-4');
    // writing the same note again is not a change
    expect(writeNote(pattern, 1, 1, 60)).toBe(false);
    expect(clearCell(pattern, 1, 1)).toBe(true);
    expect(clearCell(pattern, 1, 1)).toBe(false);
    expect(cellLabelAt(pattern, 1, 1)).toBe('...');
  });

  it('ignores writes off the grid instead of throwing', () => {
    const pattern = emptyPattern('P', 4, 1);
    expect(writeNote(pattern, 99, 99, 60)).toBe(false);
    expect(clearCell(pattern, -1, 0)).toBe(false);
  });

  it('clamps a note into the playable range', () => {
    const pattern = emptyPattern('P', 4, 1);
    writeNote(pattern, 0, 0, 9999);
    expect(cellLabelAt(pattern, 0, 0)).toBe('B-8');
  });

  it('clears a whole pattern', () => {
    const pattern = emptyPattern('P', 4, 2);
    writeNote(pattern, 0, 0, 60);
    writeNote(pattern, 3, 1, 64);
    expect(countNotes(pattern)).toBe(2);
    clearPattern(pattern);
    expect(isPatternEmpty(pattern)).toBe(true);
  });

  it('reports the notes sounding on a row, with their tracks and how hard they are hit', () => {
    const pattern = emptyPattern('P', 4, 3);
    writeNote(pattern, 2, 0, 60);
    writeNote(pattern, 2, 2, 67);
    // A note nobody accented is at full velocity — the level every song this app
    // could play before now was played at.
    expect(rowNotes(pattern, 2)).toEqual([
      { track: 0, midi: 60, velocity: 100, articulation: { slide: false, stutter: 1, grace: 0, bend: 0 }, drum: null },
      { track: 2, midi: 67, velocity: 100, articulation: { slide: false, stutter: 1, grace: 0, bend: 0 }, drum: null },
    ]);
    expect(rowNotes(pattern, 1)).toEqual([]);
  });
});

describe('swing, the feel of the song', () => {
  it('is straight unless somebody says otherwise', () => {
    expect(createSong().swing).toBe(0);
    expect(DEFAULT_SWING).toBe(MIN_SWING);
    expect(swingDepth(DEFAULT_SWING)).toBe(0);
  });

  it('clamps a swing amount into the range the control offers', () => {
    expect(clampSwing(-20)).toBe(MIN_SWING);
    expect(clampSwing(140)).toBe(MAX_SWING);
    expect(clampSwing(63.6)).toBe(64);
  });

  it('has both named ends, and `false` for the amount that is the default', () => {
    // The slider's own read-out says STRAIGHT at zero, so the two ends are part
    // of the vocabulary rather than a formatting detail: 0 and 100 are STRAIGHT
    // and MAX LILT, and everything between them is a percentage.
    expect(DEFAULT_SWING).toBeFalsy();
    expect(MAX_SWING).toBe(100);
  });

  it('leaves every step exactly as long as every other at swing 0', () => {
    for (let step = 0; step < 8; step++) expect(stepTimeFactor(0, step)).toBe(1);
  });

  it('keeps every PAIR of steps exactly twice one step, so the tempo never moves', () => {
    // This is the property that makes swing a feel rather than a tempo change:
    // one step grows by exactly what its neighbour shrinks by, so the bar, the
    // loop and the playhead all stay where they were.
    for (const swing of [10, 25, 50, 75, 100]) {
      for (let even = 0; even < 8; even += 2) {
        expect(stepTimeFactor(swing, even) + stepTimeFactor(swing, even + 1)).toBeCloseTo(2, 10);
      }
    }
  });

  it('pushes every SECOND step later, deeper the more swing it is asked for', () => {
    // Step 0 is long and step 1 is short: the shape every shuffle has.
    expect(stepTimeFactor(100, 0)).toBeGreaterThan(1);
    expect(stepTimeFactor(100, 1)).toBeLessThan(1);
    let previous = 1;
    for (const swing of [0, 20, 40, 60, 80, 100]) {
      const long = stepTimeFactor(swing, 0);
      expect(long).toBeGreaterThanOrEqual(previous);
      previous = long;
    }
    expect(stepTimeFactor(100, 0)).toBeCloseTo(1 + 1 / 3, 10);
  });

  it('never shortens a step into nothing, however deep the swing', () => {
    // A slot of zero length would be a note the sequencer cannot place at all,
    // so the deepest setting still leaves two thirds of the step standing.
    for (const swing of [0, 50, 100, 1000]) {
      for (let step = 0; step < 4; step++) {
        expect(stepTimeFactor(swing, step)).toBeGreaterThan(0.6);
      }
    }
  });

  it('swings a pattern of any length the same way, step by step', () => {
    // The factor depends on the step's INDEX, so a 16-step bar swings as eight
    // long-short pairs — which is what a person means by "shuffle the hats".
    const factors = Array.from({ length: 16 }, (_, step) => stepTimeFactor(60, step));
    expect(factors.filter((f) => f > 1)).toHaveLength(8);
    expect(factors.filter((f) => f < 1)).toHaveLength(8);
    expect(factors[0]).toBe(factors[2]);
    expect(factors[1]).toBe(factors[3]);
  });
});

describe('a channel\'s expression: glide and vibrato', () => {
  it('starts every channel with no slide and no wobble, so no song is re-voiced', () => {
    expect(DEFAULT_GLIDE).toBe(MIN_GLIDE);
    expect(DEFAULT_VIBRATO).toBe(MIN_VIBRATO);
    const track = emptyTrack(0);
    expect(track.glide).toBe(DEFAULT_GLIDE);
    expect(track.vibrato).toBe(DEFAULT_VIBRATO);
  });

  it('clamps both into 0..100, and reads a value it cannot use as off', () => {
    expect(clampGlide(140)).toBe(MAX_GLIDE);
    expect(clampGlide(-10)).toBe(MIN_GLIDE);
    expect(clampGlide(Number.NaN)).toBe(DEFAULT_GLIDE);
    expect(clampVibrato(140)).toBe(MAX_VIBRATO);
    expect(clampVibrato(-10)).toBe(MIN_VIBRATO);
    expect(clampVibrato(44.6)).toBe(45);
  });

  it('reads OFF at zero and a percentage above it', () => {
    expect(glideLabel(0)).toBe('OFF');
    expect(glideLabel(40)).toBe('40%');
    expect(vibratoLabel(0)).toBe('OFF');
    expect(vibratoLabel(30)).toBe('30%');
  });

  it('nudges on the same ten-percent step as every other amount', () => {
    expect(EXPRESSION_STEP).toBe(10);
  });
});

describe('velocity', () => {
  it('starts every note at full force, which is how the app always played them', () => {
    // The whole reason velocity could be added to a hundred songs at once: a
    // note nobody accented is exactly as loud as it was before velocity existed.
    expect(DEFAULT_VELOCITY).toBe(MAX_VELOCITY);
    expect(emptyCell()).toEqual({ note: null, extra: [], drum: null, velocity: DEFAULT_VELOCITY, slide: false, stutter: DEFAULT_STUTTER, grace: 0, bend: 0 });
    const pattern = emptyPattern('P', 2, 1);
    writeNote(pattern, 0, 0, 60);
    expect(pattern.steps[0][0].velocity).toBe(DEFAULT_VELOCITY);
  });

  it('clamps a velocity a person (or a file) would nudge, and survives a nonsense one', () => {
    expect(clampVelocity(140)).toBe(MAX_VELOCITY);
    expect(clampVelocity(-20)).toBe(MIN_VELOCITY);
    expect(clampVelocity(63.6)).toBe(64);
    expect(clampVelocity(Number.NaN)).toBe(DEFAULT_VELOCITY);
  });

  it('ranges from silence to full, because the range is the guarantee', () => {
    expect(MIN_VELOCITY).toBe(0);
    expect(MAX_VELOCITY).toBe(100);
    expect(velocityLabel(MIN_VELOCITY)).toBe('0%');
    expect(velocityLabel(999)).toBe('100%');
  });

  it('nudges on a ten-percent grid that snaps toward the direction of travel', () => {
    // The same rule as a level and a room amount, so every loudness control in
    // the app speaks one arithmetic.
    expect(VELOCITY_STEP).toBe(10);
    expect(stepVelocity(40, 1)).toBe(50);
    expect(stepVelocity(40, -1)).toBe(30);
    expect(stepVelocity(0, -1)).toBe(0);
    expect(stepVelocity(100, 1)).toBe(100);
    // Off a stop, the smallest audible move in the direction pressed.
    expect(stepVelocity(37, 1)).toBe(40);
    expect(stepVelocity(37, -1)).toBe(30);
    expect(stepVelocity(50, 3)).toBe(80);
  });

  it('copies with the pattern, so a copied bar keeps its accents', () => {
    const song = createSong();
    song.patterns[0].steps[0][0] = { note: 60, extra: [], drum: null, velocity: 40, slide: true, stutter: 3, grace: 0, bend: 0 };
    copyPattern(song, 1, 2);
    expect(song.patterns[1].steps[0][0]).toEqual({ note: 60, extra: [], drum: null, velocity: 40, slide: true, stutter: 3, grace: 0, bend: 0 });
  });

  it('keeps the velocity on the note and clamps it on the way to the sequencer', () => {
    const pattern = emptyPattern('P', 2, 2);
    pattern.steps[0][0] = { note: 60, extra: [], drum: null, velocity: 30, slide: false, stutter: 1, grace: 0, bend: 0 };
    // A wild number from a hand-edited file never reaches the audio graph: the
    // row reads back clamped, so the range holds at the door.
    pattern.steps[0][1] = { note: 64, extra: [], drum: null, velocity: 5000, slide: false, stutter: 9, grace: 0, bend: 0 };
    expect(rowNotes(pattern, 0)).toEqual([
      { track: 0, midi: 60, velocity: 30, articulation: { slide: false, stutter: 1, grace: 0, bend: 0 }, drum: null },
      { track: 1, midi: 64, velocity: 100, articulation: { slide: false, stutter: 8, grace: 0, bend: 0 }, drum: null },
    ]);
  });
});
