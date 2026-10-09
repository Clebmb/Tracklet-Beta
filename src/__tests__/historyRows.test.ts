import { describe, expect, it } from 'vitest';

import { applyScript, createSong, type Song } from '../model';
import { describeChange, historyRows } from '../ui/historyRows';

/**
 * The undo timeline as a list a person can read.
 *
 * The interesting property is that the sentences are DERIVED — a row is a diff of
 * two snapshots, so it can never disagree with the edit it names — so the tests
 * check the ordering of the diff as much as the wording.
 */

function edited(source: string): Song {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
  return result.song;
}

/** A song as the base, then the edit applied to it. */
function pair(source: string): [Song, Song] {
  const before = createSong();
  return [before, edited(source)];
}

describe('describing one change', () => {
  it('names the widest thing first, from the top of the song down', () => {
    expect(describeChange(...pair('song "NEW TITLE"\n'))).toBe('TITLE  -  NEW TITLE');
    expect(describeChange(...pair('tempo 140\n'))).toBe('TEMPO  120 -> 140');
    expect(describeChange(...pair('key D minor\n'))).toBe('KEY  D MINOR');
    expect(describeChange(...pair('tracks 2\n'))).toBe('CHANNELS  4 -> 2');
    expect(describeChange(...pair('steps 32\n'))).toBe('STEPS  32');
  });

  it('falls through to a channel when the shape is unchanged', () => {
    const [before, after] = pair('track 1 "LEAD"\nC-4\n');
    // A title, tempo, track count and pattern count are all unchanged here, so
    // the first channel whose own fields moved is what the row says.
    expect(describeChange(before, after)).toBe('CHANNEL 1  -  LEAD');
  });

  it('counts the notes when nothing else moved', () => {
    const base = edited('tracks 1\nC-4\n');
    const more = edited('tracks 1\nC-4\nE-4\n');
    expect(describeChange(base, more)).toBe('NOTES  +1');
    expect(describeChange(more, base)).toBe('NOTES  -1');
  });

  it('says EDITED when it cannot name the change, rather than guessing', () => {
    const song = createSong();
    expect(describeChange(song, structuredClone(song))).toBe('EDITED');
  });
});

describe('the timeline as rows', () => {
  it('shows only the present when nothing has happened', () => {
    const song = createSong();
    expect(historyRows([], { song })).toEqual([{ label: 'NOW', detail: 'WHERE THE SESSION BEGAN' }]);
  });

  it('lists newest first, with how far back each state is', () => {
    const a = createSong();
    const b = edited('tempo 140\n');
    const rows = historyRows([{ song: a }, { song: b }], { song: b });
    expect(rows.map((row) => row.label)).toEqual(['NOW', '1 BACK', '2 BACK']);
    // The OLDEST row is the beginning of the session, not a change.
    expect(rows[2].detail).toBe('WHERE THE SESSION BEGAN');
    // Each other row describes the change that produced it.
    expect(rows[1].detail).toBe('TEMPO  120 -> 140');
    expect(rows[0].detail).toBe('EDITED');
  });

  it('reads the same length as the stack plus the present', () => {
    const stack = Array.from({ length: 5 }, () => ({ song: createSong() }));
    expect(historyRows(stack, { song: createSong() })).toHaveLength(6);
  });
});
