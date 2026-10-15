import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  DEFAULT_KEY,
  progressionStepRoot,
  songToScript,
  withProgressionSteps,
} from '../model';
import {
  BASS_RHYTHMS,
  bassFollowNotes,
  euclidPattern,
  euclidPatternString,
} from '../plugins/generator';
import { BUILT_IN_GENERATORS } from '../plugins/builtIn';
import { defineGenerator } from '../plugins/sdk';
import { seatGeneratorModule } from '../plugins/loader';
import euclidManifest from '../../examples/plugins/euclid-drums/manifest.json';
import { expand as expandEuclid, pattern as euclidPatternExample } from '../../examples/plugins/euclid-drums/index';
import bassManifest from '../../examples/plugins/bass-follow/manifest.json';
import { expand as expandBass } from '../../examples/plugins/bass-follow/index';

/** Apply a fragment, throwing the refusal's own message on failure. */
function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' / '));
  return result.song;
}

/** Refuse a fragment, handing back the messages. */
function refused(source: string): string[] {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors.map((e) => e.message);
}

describe('euclidPattern spreads hits evenly', () => {
  it('writes E(3, 8) as 9..9..9.', () => {
    expect(euclidPatternString(3, 8)).toBe('9..9..9.');
  });

  it('writes E(5, 16) with five hits', () => {
    const pattern = euclidPatternString(5, 16);
    expect(pattern).toHaveLength(16);
    expect([...pattern].filter((char) => char === '9')).toHaveLength(5);
    expect(pattern).toBe('9...9..9..9..9..');
  });

  it('turns the rhythm forward with rotate', () => {
    expect(euclidPatternString(3, 8, 2)).toBe('9.9..9..');
  });

  it('is deterministic: the same three numbers always write the same beat', () => {
    expect(euclidPattern(5, 16, 3)).toEqual(euclidPattern(5, 16, 3));
    expect(euclidPatternString(7, 16, 1)).toBe(euclidPatternString(7, 16, 1));
  });

  it('clamps rather than crashing: no pulses is silence, more than steps is all hits', () => {
    expect(euclidPatternString(0, 8)).toBe('........');
    expect(euclidPatternString(99, 4)).toBe('9999');
  });
});

describe('bassFollowNotes hangs on the loop', () => {
  const loop = withProgressionSteps(
    [
      { kind: 'name', root: 9, quality: 'minor' },
      { kind: 'name', root: 5, quality: 'major' },
    ],
    4,
  );

  it('walks every chord start with four', () => {
    const notes = bassFollowNotes(loop, DEFAULT_KEY, 2, 16, 0, 'four');
    expect(notes.map((note) => note.row)).toEqual([0, 4, 8, 12]);
    expect(notes[0].midi).toBe(progressionStepRoot(loop.steps[0], DEFAULT_KEY, 2));
    expect(notes[1].midi).toBe(progressionStepRoot(loop.steps[1], DEFAULT_KEY, 2));
  });

  it('walks every other start with half', () => {
    expect(bassFollowNotes(loop, DEFAULT_KEY, 2, 16, 0, 'half').map((note) => note.row)).toEqual([0, 8]);
  });

  it('shifts each start half a hold late with offbeat', () => {
    expect(bassFollowNotes(loop, DEFAULT_KEY, 2, 16, 0, 'offbeat').map((note) => note.row)).toEqual([2, 6, 10, 14]);
  });

  it('publishes its three rhythms', () => {
    expect([...BASS_RHYTHMS]).toEqual(['four', 'half', 'offbeat']);
  });
});

describe('the generator trust gate', () => {
  it('seats a constructive module with an expand function', () => {
    const defined = defineGenerator({ manifest: euclidManifest, expand: expandEuclid, mode: 'constructive' });
    expect(defined.ok).toBe(true);
  });

  it('refuses a kind it does not seat, naming the milestone', () => {
    const defined = defineGenerator({
      manifest: { ...(euclidManifest as Record<string, unknown>), kind: 'instrument' },
      expand: expandEuclid,
    });
    expect(defined.ok).toBe(false);
    if (!defined.ok) expect(defined.error).toContain('not a generator');
  });

  it('refuses a module with no expansion in words', () => {
    const defined = defineGenerator({ manifest: euclidManifest, expand: undefined });
    expect(defined.ok).toBe(false);
    if (!defined.ok) expect(defined.error).toContain('no expand function');
  });

  it('refuses an interpretive generator: this build seats writers only', () => {
    const defined = defineGenerator({ manifest: euclidManifest, expand: expandEuclid, mode: 'interpretive' });
    expect(defined.ok).toBe(false);
    if (!defined.ok) expect(defined.error).toContain('interpretive');
  });

  it('seats both proofs through the loader', () => {
    for (const [manifest, expand] of [
      [euclidManifest, expandEuclid],
      [bassManifest, expandBass],
    ] as const) {
      const seated = seatGeneratorModule(manifest, { expand });
      expect(seated.ok).toBe(true);
    }
  });

  it('carries both proofs as built-ins', () => {
    expect(BUILT_IN_GENERATORS.map((plugin) => plugin.manifest.id)).toEqual([
      'com.example.euclid-drums',
      'com.example.bass-follow',
    ]);
    for (const plugin of BUILT_IN_GENERATORS) expect(plugin.mode).toBe('constructive');
  });
});

describe('the proof modules agree with the contract', () => {
  it('euclid-drums expands the rhythm the host spreads', () => {
    expect(expandEuclid({ pulses: 3, steps: 8 })).toEqual(euclidPattern(3, 8));
    expect(euclidPatternExample({ pulses: 3, steps: 8 })).toBe(euclidPatternString(3, 8));
  });

  it('bass-follow hits the rows the host keeps for the same roots', () => {
    const loop = withProgressionSteps(
      [
        { kind: 'name', root: 9, quality: 'minor' },
        { kind: 'name', root: 5, quality: 'major' },
      ],
      4,
    );
    const roots = [0, 1].map((index) => progressionStepRoot(loop.steps[index], DEFAULT_KEY, 2));
    const mine = bassFollowNotes(loop, DEFAULT_KEY, 2, 16, 0, 'half');
    const theirs = expandBass({ roots, hold: 4, rows: 16, rhythm: 'half' });
    expect(theirs).toEqual(mine);
  });
});

describe('generate euclid writes a pad row', () => {
  it('spreads five hits over the machine on pad 1', () => {
    const song = applied('generate euclid pad 1 5');
    expect(song.machine?.pads[0].steps.filter((hit) => hit > 0)).toHaveLength(5);
    expect(song.machine?.pads[0].steps).toHaveLength(16);
  });

  it('turns the rhythm with rotate and reaches another bar with bar', () => {
    const song = applied('machine bars 2\ngenerate euclid pad 2 3 rotate 2 bar 2');
    expect(song.machine?.pads[1].steps.every((hit) => hit === 0)).toBe(true);
    expect(song.machine?.bars[0][1]?.filter((hit) => hit > 0)).toHaveLength(3);
  });

  it('round-trips through script: a generated beat reads back as a pad pattern', () => {
    const song = applied('generate euclid pad 1 5');
    const reread = applied(songToScript(song));
    expect(reread.machine?.pads[0].steps).toEqual(song.machine?.pads[0].steps);
  });

  it('refuses what it cannot spread', () => {
    expect(refused('generate')[0]).toContain('generate takes a generator');
    expect(refused('generate wobble')[0]).toContain('is not a generator');
    expect(refused('generate euclid 1 5')[0]).toContain('drum-machine pad');
    expect(refused('generate euclid pad 9 5')[0]).toContain('pad number');
    expect(refused('generate euclid pad 1 0')[0]).toContain('needs 1..16 hits');
    expect(refused('generate euclid pad 1 99')[0]).toContain('needs 1..16 hits');
    expect(refused('generate euclid pad 1 5 sideways 2')[0]).toContain('is not a euclid option');
    expect(refused('generate euclid pad 1 5 bar 99')[0]).toContain('"bar N"');
  });
});

describe('generate bass writes the loop', () => {
  const LOOP = 'progression Am F C G\n';

  it('writes one root per chord on the channel it names', () => {
    const song = applied(`${LOOP}generate bass 0 2`);
    const column = song.patterns[0].steps.map((row) => row[1]?.note ?? null);
    const written = song.patterns[0].steps
      .map((row, index) => ({ index, note: row[1]?.note ?? null }))
      .filter((cell) => cell.note !== null);
    expect(written.map((cell) => cell.index)).toEqual([0, 4, 8, 12]);
    expect(column[0]).toBe(progressionStepRoot({ kind: 'name', root: 9, quality: 'minor' }, song.key, 4));
    expect(new Set(written.map((cell) => cell.note)).size).toBe(4);
  });

  it('thins the line with half and shifts it with offbeat', () => {
    const half = applied(`${LOOP}generate bass 0 2 rhythm half`);
    const halfRows = half.patterns[0].steps
      .map((row, index) => ({ index, note: row[1]?.note ?? null }))
      .filter((cell) => cell.note !== null)
      .map((cell) => cell.index);
    expect(halfRows).toEqual([0, 8]);
    const off = applied(`${LOOP}generate bass 0 2 rhythm offbeat`);
    const offRows = off.patterns[0].steps
      .map((row, index) => ({ index, note: row[1]?.note ?? null }))
      .filter((cell) => cell.note !== null)
      .map((cell) => cell.index);
    expect(offRows).toEqual([2, 6, 10, 14]);
  });

  it('round-trips through script as ordinary cells', () => {
    const song = applied(`${LOOP}generate bass 0 2`);
    const reread = applied(songToScript(song));
    expect(reread.patterns[0].steps.map((row) => row[1]?.note ?? null)).toEqual(
      song.patterns[0].steps.map((row) => row[1]?.note ?? null),
    );
  });

  it('refuses what it cannot hang', () => {
    expect(refused('generate bass 0')[0]).toContain('generate bass writes');
    expect(refused(`${LOOP}generate bass 0 2 rhythm swing`)[0]).toContain('is not a bass rhythm');
    expect(refused('generate bass 0 2')[0]).toContain('nothing to follow');
    expect(refused(`${LOOP}generate bass 99 2`)[0]).toContain('row must be');
    expect(refused(`${LOOP}generate bass 0 99`)[0]).toContain('track must be');
  });
});
