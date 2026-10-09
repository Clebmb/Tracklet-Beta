import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { repositoryRoot } from '../src/library';
/**
 * The Core API, tested as a consumer would use it.
 *
 * These are not tests of the model — `src/__tests__` already proves the language,
 * the files and the exporters. They are tests of the CONTRACT this folder adds on
 * top: every operation answers with the one envelope, the registry describes
 * itself, a script survives a round trip through apply/format, and the boundary
 * cases (a blank song, a missing operation, audio in Node) refuse in the way a
 * caller is told to expect.
 */

import { describe, expect, it } from 'vitest';

import { callOperation, createTrackletApi, operationNames, OPERATIONS } from '../src/index';

const api = createTrackletApi();

/** Fail loudly with the refusal's own message, so a test failure is readable. */
function unwrap<T = Record<string, unknown>>(result: { ok: boolean; result?: unknown; error?: unknown }): T {
  if (!result.ok) throw new Error(`expected a result, got: ${JSON.stringify(result.error)}`);
  return result.result as T;
}

const GOOD_SCRIPT = [
  'new',
  'song "ROUND TRIP"',
  'key D minor',
  'tempo 100',
  'steps 16',
  'tracks 4',
  'track 1 "LEAD" voice lead level 100',
  'track 2 "BASS" voice bass level 64',
  'track 3 "PAD"  voice pad  level 44 hold 4',
  'track 4 "KIT"  voice hat  level 32',
  'pattern 1 "A"',
  'D-5 D-2 A-3 kick',
  '.   .   .   hat',
  'C-5 A-2 G-3 .',
  '.   .   .   hat',
  'F-5 D-2 F-3 snare',
  '.   .   .   hat',
  'A-5 A-2 E-3 .',
  '.   .   .   hat',
  'D-5 D-2 A-3 kick',
  '.   .   .   hat',
  'C-5 A-2 G-3 .',
  '.   .   .   hat',
  'F-5 D-2 F-3 snare',
  '.   .   .   hat',
  'A-5 A-2 E-3 .',
  '.   .   .   hat',
  '',
].join('\n');

describe('the registry', () => {
  it('names every operation uniquely, in a namespace', () => {
    const names = operationNames();
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+\.[a-z_]+$/);
  });

  it('describes every operation with a summary, a category and an example', () => {
    for (const operation of OPERATIONS) {
      expect(operation.summary.length).toBeGreaterThan(10);
      expect(operation.title.length).toBeGreaterThan(0);
      expect(['language', 'song', 'script', 'library', 'export', 'machine', 'arranger', 'live', 'recorder', 'arp', 'workspace', 'meta']).toContain(operation.category);
      expect(operation.input.type).toBe('object');
      expect(operation.example).toBeTypeOf('object');
    }
  });

  it('answers api.describe with every operation', async () => {
    const described = unwrap<{ name: string; operations: { name: string }[] }>(await api.api.describe());
    expect(described.name).toBe('tracklet-core-api');
    expect(described.operations.map((entry) => entry.name).sort()).toEqual([...operationNames()].sort());
  });

  it('refuses an unknown operation by name, and suggests near ones', async () => {
    const result = await callOperation('script.nope', {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not_found');
    expect(result.error.details?.join(' ')).toContain('api.describe');
  });

  it('always answers with the envelope, whatever it is given', async () => {
    // Every operation, called with no arguments at all. Each one either succeeds
    // (it needs nothing) or refuses with a code from the closed set — never a
    // throw, and never a shape a caller has to guess at.
    for (const operation of OPERATIONS) {
      const result = await callOperation(operation.name, {});
      if (result.ok) continue;
      expect(['invalid_input', 'script_refused', 'file_refused', 'not_found', 'unsupported', 'internal']).toContain(
        result.error.code,
      );
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });
});

describe('the language operations', () => {
  it('publishes a manifest whose keywords all have a command', async () => {
    const capabilities = unwrap<{ scriptVersion: number; keywords: string[]; commands: { word: string }[] }>(
      await api.language.capabilities(),
    );
    expect(capabilities.scriptVersion).toBeGreaterThanOrEqual(21);
    expect(capabilities.commands.map((command) => command.word)).toEqual(capabilities.keywords);
  });

  it('filters commands by tier', async () => {
    const core = unwrap<{ tier: string; commands: unknown[] }>(await api.language.commands({ tier: 'core' }));
    const deep = unwrap<{ tier: string; commands: unknown[] }>(await api.language.commands({ tier: 'deep' }));
    expect(core.tier).toBe('core');
    expect(deep.tier).toBe('deep');
    expect(core.commands.length).toBeGreaterThan(10);
    expect(deep.commands.length).toBeGreaterThan(5);
  });

  it('searches the vocabulary and finds a word by description', async () => {
    const hits = unwrap<{ count: number; hits: { id: string }[] }>(await api.language.search({ query: 'bass' }));
    expect(hits.count).toBeGreaterThan(0);
    expect(hits.hits.map((hit) => hit.id)).toContain('bass');
  });

  it('hands back a starter as a script that parses', async () => {
    const starter = unwrap<{ script: string }>(await api.language.starter({ id: 'house' }));
    const checked = unwrap<{ valid: boolean }>(await api.script.validate({ script: starter.script }));
    expect(checked.valid).toBe(true);
  });
});

describe('scripts', () => {
  it('validates a good script without changing anything', async () => {
    const result = unwrap<{ valid: boolean; summary: { title: string; notes: number } }>(
      await api.script.validate({ script: GOOD_SCRIPT }),
    );
    expect(result.valid).toBe(true);
    expect(result.summary.title).toBe('ROUND TRIP');
    expect(result.summary.notes).toBeGreaterThan(10);
  });

  it('reports every problem in a bad script at once, with line numbers', async () => {
    const result = unwrap<{ valid: boolean; diagnostics: string[] }>(
      await api.script.validate({ script: 'new\nsong "X"\nnonsense here\n' }),
    );
    expect(result.valid).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]).toMatch(/^line \d+: /);
  });

  it('applies a script and reports the song it made', async () => {
    const applied = unwrap<{ song: unknown; summary: { tracks: number; patterns: number }; description: { title: string } }>(
      await api.script.apply({ script: GOOD_SCRIPT }),
    );
    expect(applied.summary.tracks).toBe(4);
    expect(applied.summary.patterns).toBe(1);
    expect(applied.description.title).toBe('ROUND TRIP');
  });

  it('round-trips a song through format and apply, exactly', async () => {
    const first = await api.script.apply({ script: GOOD_SCRIPT });
    const song = unwrap<{ song: Record<string, unknown> }>(first).song;
    const formatted = unwrap<{ script: string }>(await api.script.format({ song }));
    const second = await api.script.apply({ script: formatted.script });
    expect(unwrap<{ song: unknown }>(second).song).toEqual(song);
  });

  it('builds on a song it is given instead of starting over', async () => {
    const blank = unwrap<{ song: Record<string, unknown> }>(await api.song.create({ title: 'BASE', tracks: 3 }));
    const built = unwrap<{ song: { title: string } }>(
      await api.script.apply({ song: blank.song, script: 'song "BUILT"\n' }),
    );
    expect(built.song.title).toBe('BUILT');
  });
});

describe('songs', () => {
  it('creates a song from a header and says what it is', async () => {
    const made = unwrap<{ song: { title: string; bpm: number; tracks: unknown[] }; description: { key: string } }>(
      await api.song.create({ title: 'MADE', key: 'F# dorian', tempo: 132, tracks: 6, steps: 32 }),
    );
    expect(made.song.title).toBe('MADE');
    expect(made.song.bpm).toBe(132);
    expect(made.song.tracks).toHaveLength(6);
    expect(made.description.key).toBe('F# DORIAN');
  });

  it('refuses a key the language cannot spell', async () => {
    const result = await api.song.create({ key: 'H major' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
  });

  it('prints a pattern as a grid', async () => {
    const applied = unwrap<{ song: Record<string, unknown> }>(await api.script.apply({ script: GOOD_SCRIPT }));
    const grid = unwrap<{ text: string }>(await api.song.grid({ song: applied.song, pattern: 1 }));
    expect(grid.text).toContain('LEAD');
    expect(grid.text.split('\n').length).toBe(17); // a header line and sixteen steps
    expect(grid.text).toContain('kick');
  });

  it('round-trips a song through JSON', async () => {
    const applied = unwrap<{ song: unknown }>(await api.script.apply({ script: GOOD_SCRIPT }));
    const written = unwrap<{ json: string }>(await api.song.to_json({ song: applied.song }));
    const read = unwrap<{ song: unknown }>(await api.song.from_json({ json: written.json }));
    expect(read.song).toEqual(applied.song);
  });

  it('describes a blank song honestly', async () => {
    const description = unwrap<{ title: string; notes: number; tracks: number; patterns: number }>(
      await api.song.describe({}),
    );
    expect(description.tracks).toBeGreaterThanOrEqual(3);
    expect(description.notes).toBe(0);
    expect(description.patterns).toBeGreaterThanOrEqual(1);
  });
});

describe('exports', () => {
  it('writes a MIDI file for a song with notes', async () => {
    const applied = unwrap<{ song: Record<string, unknown> }>(await api.script.apply({ script: GOOD_SCRIPT }));
    const midi = unwrap<{ bytesBase64: string; byteLength: number; summary: { notes: number; tracks: number } }>(
      await api.export.midi({ song: applied.song }),
    );
    expect(midi.byteLength).toBeGreaterThan(30);
    expect(Buffer.from(midi.bytesBase64, 'base64').length).toBe(midi.byteLength);
    expect(midi.summary.notes).toBeGreaterThan(10);
    expect(midi.summary.tracks).toBeGreaterThan(0);
  });

  it('refuses to write MIDI for a blank song, in words', async () => {
    const result = await api.export.midi({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.message).toContain('no notes');
  });

  it('plans stems for the channels that carry something', async () => {
    const applied = unwrap<{ song: Record<string, unknown> }>(await api.script.apply({ script: GOOD_SCRIPT }));
    const plan = unwrap<{ count: number; archive: string; entries: { track: number; name: string }[] }>(
      await api.export.stems({ song: applied.song }),
    );
    expect(plan.count).toBe(4);
    expect(plan.archive).toMatch(/-stems\.zip$/);
    expect(plan.entries[0]?.name).toMatch(/\.wav$/);
  });

  it('counts a drum-only channel as a stem, since a hit carries a MIDI pitch', async () => {
    const source = [
      'new',
      'song "DRUMS ONLY"',
      'key A minor',
      'tracks 2',
      'track 1 "LEAD" voice lead',
      'track 2 "KIT"  voice kick',
      'pattern 1 "A"',
      'A-4 kick',
      '.   hat',
      'C-5 snare',
      '.   hat',
      '',
    ].join('\n');
    const applied = unwrap<{ song: Record<string, unknown> }>(await api.script.apply({ script: source }));
    const plan = unwrap<{ count: number; entries: { track: number }[] }>(await api.export.stems({ song: applied.song }));
    expect(plan.count).toBe(2);
    expect(plan.entries.map((entry) => entry.track)).toEqual([1, 2]);
  });

  it('describes a loop region and a loudness target as statements', async () => {
    const plan = unwrap<{ regionLabel: string; statements: string[] }>(
      await api.export.plan({ from: 8, to: 15, loud: -14 }),
    );
    expect(plan.statements).toContain('export bars 8 to 15');
    expect(plan.statements).toContain('export loud -14');
    expect(plan.regionLabel).toBe('BARS 8-15');
  });

  it('is honest that audio rendering is not available here', async () => {
    const result = await api.export.audio({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('unsupported');
  });
});

describe('the library', () => {
  it.skipIf(!existsSync(join(repositoryRoot(), 'scripts/deepseek')))('lists the songs in the repository and how many parse', async () => {
    const listed = unwrap<{ count: number; parsed: number; entries: { path: string; ok: boolean }[] }>(
      await api.library.list({ query: 'deepseek' }),
    );
    expect(listed.count).toBeGreaterThanOrEqual(10);
    expect(listed.parsed).toBe(listed.count);
    expect(listed.entries.every((entry) => entry.ok)).toBe(true);
  });

  it.skipIf(!existsSync(join(repositoryRoot(), 'scripts/deepseek')))('opens a listed song into a real song', async () => {
    const opened = unwrap<{ path: string; song: { title: string }; summary: { notes: number } }>(
      await api.library.open({ path: 'scripts/deepseek/01-twelve-bar-midnight.txt' }),
    );
    expect(opened.song.title).toBe('TWELVE BAR MIDNIGHT');
    expect(opened.summary.notes).toBeGreaterThan(50);
  });

  it('refuses a path outside the song folders', async () => {
    const result = await api.library.read({ path: '../../../etc/passwd' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
  });
});
