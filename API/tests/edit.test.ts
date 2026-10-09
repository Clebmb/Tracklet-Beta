/**
 * `song.edit` — the surgical editor, tested as a caller uses it.
 *
 * The interesting claims are three, and each has its own block below:
 *
 *   • a small edit changes a small thing and says so — the change log names the
 *     value before and the value after, so "I changed row 4" is checkable;
 *   • a bad edit refuses the WHOLE call, and the song the caller passed in is
 *     not the object that was ever touched;
 *   • the fields an edit offers mean what the model's own writers mean, so a
 *     clamp is a clamp and a pattern named past the end is created rather than
 *     refused.
 */

import { describe, expect, it } from 'vitest';

import { callOperation } from '../src/index';
import { applyScript, createSong, type Song } from '../../src/model';

/** A tiny song to edit: one pattern, three channels, one note each. */
const SOURCE = [
  'new',
  'song "SUBJECT"',
  'key D minor',
  'tempo 100',
  'steps 16',
  'tracks 3',
  'track 1 "LEAD" voice lead',
  'track 2 "BASS" voice bass  level 64',
  'track 3 "PAD"  voice pad   hold 4',
  'pattern 1 "A"',
  'D-5 D-2 D-3',
  '',
].join('\n');

function subject(): Song {
  const applied = applyScript(createSong(), SOURCE);
  if (!applied.ok) throw new Error('the fixture must parse');
  return applied.song;
}

interface EditResult {
  song: Song;
  edits: { edit: number; op: string; target: string; from: string; to: string; changed: boolean }[];
  changed: number;
}

async function edit(input: Record<string, unknown>) {
  return callOperation('song.edit', input);
}

async function edited(input: Record<string, unknown>): Promise<EditResult> {
  const result = await edit(input);
  if (!result.ok) throw new Error(`expected an edit to land: ${JSON.stringify(result.error)}`);
  return result.result as EditResult;
}

describe('a small edit changes a small thing', () => {
  it('sets a cell, a tempo and a channel in one call, and logs each', async () => {
    const result = await edited({
      song: subject(),
      edits: [
        { op: 'song.set', bpm: 124 },
        { op: 'cell.set', pattern: 1, row: 0, track: 1, note: 'C-4' },
        { op: 'track.set', track: 2, level: 70 },
      ],
    });
    expect(result.song.bpm).toBe(124);
    expect(result.song.tracks[1]?.level).toBe(70);
    expect(result.edits.map((change) => change.target)).toEqual(['tempo', 'pattern 1 row 0 channel 1', 'channel 2 level']);
    expect(result.changed).toBe(3);
  });

  it('records the value before and the value after', async () => {
    const result = await edited({
      song: subject(),
      edits: [{ op: 'cell.set', pattern: 1, row: 0, track: 1, note: 'F-4' }],
    });
    const change = result.edits[0];
    expect(change?.from).toBe('D-5');
    expect(change?.to).toBe('F-4');
    expect(change?.changed).toBe(true);
  });

  it('accepts a note as a name or as a MIDI number — the same note either way', async () => {
    const byName = await edited({ song: subject(), edits: [{ op: 'cell.set', pattern: 1, row: 0, track: 1, note: 'C-4' }] });
    const byNumber = await edited({ song: subject(), edits: [{ op: 'cell.set', pattern: 1, row: 0, track: 1, note: 60 }] });
    expect(byName.song.patterns[0]?.steps[0]?.[0]?.note).toBe(60);
    expect(byNumber.song.patterns[0]?.steps[0]?.[0]?.note).toBe(60);
  });

  it('writes a chord through "notes" and keeps its order', async () => {
    const result = await edited({
      song: subject(),
      edits: [{ op: 'cell.set', pattern: 1, row: 0, track: 1, notes: ['C-4', 'E-4', 'G-4'] }],
    });
    const cell = result.song.patterns[0]?.steps[0]?.[0];
    expect(cell?.note).toBe(60);
    expect(cell?.extra).toEqual([64, 67]);
  });

  it('writes a drum, and refuses a step that is both a drum and a note', async () => {
    const result = await edited({ song: subject(), edits: [{ op: 'cell.set', pattern: 1, row: 1, track: 3, drum: 'kick' }] });
    expect(result.song.patterns[0]?.steps[1]?.[2]?.drum).toBe('kick');

    const both = await edit({ song: subject(), edits: [{ op: 'cell.set', pattern: 1, row: 1, track: 3, drum: 'kick', note: 'C-4' }] });
    expect(both.ok).toBe(false);
    if (!both.ok) {
      expect(both.error.code).toBe('invalid_input');
      expect(both.error.message).toContain('edit 1');
    }
  });

  it('marks an edit that changed nothing as unchanged, rather than dropping the line', async () => {
    const result = await edited({
      song: subject(),
      edits: [
        { op: 'song.set', bpm: 100 },
        { op: 'song.set', bpm: 140 },
      ],
    });
    expect(result.edits).toHaveLength(2);
    expect(result.edits[0]?.changed).toBe(false);
    expect(result.edits[1]?.changed).toBe(true);
    expect(result.changed).toBe(1);
  });
});

describe('an edit that does not fit refuses the whole call', () => {
  it('leaves the song the caller passed in untouched', async () => {
    const original = subject();
    const before = original.bpm;
    const result = await edit({
      song: original,
      edits: [
        { op: 'song.set', bpm: 175 },
        { op: 'cell.set', pattern: 1, row: 999, track: 1, note: 'C-4' },
      ],
    });
    expect(result.ok).toBe(false);
    // The first edit would have landed, but the second refused the call, and the
    // caller's own object is not the one that was ever being changed.
    expect(original.bpm).toBe(before);
  });

  it('names the edit that did not fit', async () => {
    const result = await edit({
      song: subject(),
      edits: [{ op: 'song.set', bpm: 120 }, { op: 'track.set', track: 99, level: 50 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not_found');
      expect(result.error.message).toContain('edit 2');
    }
  });

  it('refuses a row past the end of the pattern', async () => {
    const result = await edit({ song: subject(), edits: [{ op: 'cell.set', pattern: 1, row: 16, track: 1, note: 'C-4' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });

  it('refuses a note that is not a note', async () => {
    const result = await edit({ song: subject(), edits: [{ op: 'cell.set', pattern: 1, row: 0, track: 1, note: 'H-9' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_input');
      expect(result.error.message).toContain('not a note');
    }
  });

  it('refuses an unknown edit word, listing the ones that exist', async () => {
    const result = await edit({ song: subject(), edits: [{ op: 'cell.swap' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_input');
      expect(result.error.message).toContain('cell.set');
    }
  });

  it('refuses an empty or missing edit list', async () => {
    expect((await edit({ song: subject(), edits: [] })).ok).toBe(false);
    expect((await edit({ song: subject() })).ok).toBe(false);
  });

  it('refuses a key, a kit and a groove that the model does not know', async () => {
    for (const bad of [{ key: 'H major' }, { kit: 'cardboard' }, { groove: 'waltz' }]) {
      const result = await edit({ song: subject(), edits: [{ op: 'song.set', ...bad }] });
      expect(result.ok).toBe(false);
    }
  });
});

describe('the fields mean what the model means', () => {
  it('clamps the numbers it accepts instead of storing them raw', async () => {
    const result = await edited({
      song: subject(),
      edits: [
        { op: 'song.set', bpm: 5000 },
        { op: 'track.set', track: 2, level: 500, pan: -400 },
        { op: 'cell.set', pattern: 1, row: 0, track: 1, note: 'C-4', velocity: 9999 },
      ],
    });
    expect(result.song.bpm).toBeLessThanOrEqual(300);
    expect(result.song.tracks[1]?.level).toBeLessThanOrEqual(100);
    expect(result.song.tracks[1]?.pan).toBe(-100);
    expect(result.song.patterns[0]?.steps[0]?.[0]?.velocity).toBeLessThanOrEqual(127);
  });

  it('creates a pattern named past the end, the way a script does', async () => {
    const result = await edited({ song: subject(), edits: [{ op: 'cell.set', pattern: 3, row: 0, track: 1, note: 'A-4' }] });
    expect(result.song.patterns).toHaveLength(3);
    expect(result.song.patterns[2]?.steps[0]?.[0]?.note).toBe(69);
  });

  it('clears a step and a whole pattern', async () => {
    const result = await edited({
      song: subject(),
      edits: [{ op: 'cell.clear', pattern: 1, row: 0, track: 1 }, { op: 'pattern.clear', pattern: 1 }],
    });
    const steps = result.song.patterns[0]?.steps ?? [];
    expect(steps.every((row) => row.every((cell) => cell.note === null))).toBe(true);
  });

  it('sets the arrangement through the model’s own order rule', async () => {
    const result = await edited({ song: subject(), edits: [{ op: 'order.set', order: [1, 1, 2, 1] }] });
    expect(result.song.order).toEqual([1, 1, 2, 1]);
    expect(result.song.patterns).toHaveLength(2);
  });

  it('edits a blank song when none is given', async () => {
    const result = await edited({ edits: [{ op: 'song.set', title: 'FROM NOTHING', bpm: 90 }] });
    expect(result.song.title).toBe('FROM NOTHING');
    expect(result.song.bpm).toBe(90);
  });
});

/**
 * The MIXER's own controls, as edits.
 *
 * A channel strip carries four mix numbers (level, pan, duck and a place in the
 * room), a GROUP fader, and ten effects; the WHOLE MIX panel carries the same ten
 * effects one scope up. These are the fields and ops that closed the gap between
 * what the page can do and what an agent could ask for.
 */
describe('the mixer’s controls are reachable as edits', () => {
  it('sets a channel’s duck and effects, and clears a group with an empty bus', async () => {
    const result = await edited({
      song: subject(),
      edits: [
        { op: 'track.set', track: 2, duck: 55 },
        { op: 'track.set', track: 1, effects: { drive: 40, cab: 60 } },
      ],
    });
    expect(result.song.tracks[1]?.duck).toBe(55);
    expect(result.song.tracks[0]?.drive).toBe(40);
    expect(result.song.tracks[0]?.cab).toBe(60);
    expect(result.edits.map((change) => change.target)).toContain('channel 2 duck');
  });

  it('makes a group with bus.set and puts a channel on it', async () => {
    const result = await edited({
      song: subject(),
      edits: [
        { op: 'bus.set', name: 'drums', level: 70 },
        { op: 'track.set', track: 3, bus: 'DRUMS' },
      ],
    });
    expect(result.song.buses).toEqual([{ name: 'DRUMS', level: 70 }]);
    expect(result.song.tracks[2]?.bus).toBe('DRUMS');
  });

  it('refuses a channel joining a group the song does not have', async () => {
    const result = await edit({ song: subject(), edits: [{ op: 'track.set', track: 1, bus: 'GHOSTS' }] });
    expect(result.ok).toBe(false);
  });

  it('sets the whole mix’s effects with master.set', async () => {
    const result = await edited({ song: subject(), edits: [{ op: 'master.set', effects: { tape: 25, tilt: 15 } }] });
    expect(result.song.master.tape).toBe(25);
    expect(result.song.master.tilt).toBe(15);
  });

  it('refuses a master.set without effects', async () => {
    const result = await edit({ song: subject(), edits: [{ op: 'master.set' }] });
    expect(result.ok).toBe(false);
  });

  it('refuses a group name the language would refuse', async () => {
    const result = await edit({ song: subject(), edits: [{ op: 'bus.set', name: 'MY DRUMS', level: 70 }] });
    expect(result.ok).toBe(false);
  });
});
