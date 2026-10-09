import { describe, expect, it } from 'vitest';

import { applyScript, createSong, SCRIPT_KEYWORDS } from '../model';
import {
  capabilitiesJson,
  SCRIPT_COMMANDS,
  SCRIPT_VERSION,
  scriptCapabilities,
} from '../model/capabilities';
import { MAX_LAYERS } from '../model/instrument';
import {
  DEFAULT_MACHINE_STEPS,
  MAX_MACHINE_BARS,
  MAX_MACHINE_BEAT,
  MAX_MACHINE_STEPS,
  MAX_PADS,
  MIN_MACHINE_BEAT,
  MIN_MACHINE_STEPS,
} from '../model/machine';
import { BPM_MAX, BPM_MIN, MAX_TRACKS, MIN_TRACKS } from '../model/song';
import { SONG_FILE_VERSION, SONG_FILE_VERSION_MAX, STACK_SONG_FILE_VERSION } from '../model/songfile';
import { SCRIPT_EXAMPLE } from '../model/script';

/**
 * The capability manifest, and whether it is true.
 *
 * `window.__tracklet.capabilities` is what a tool (or a model) reads to find out
 * what a RUNNING build speaks. That makes it a promise, and this file is what
 * keeps the promise honest: every example is applied, every word the manifest
 * publishes as accepted vocabulary is really accepted, and every limit is
 * compared with the constant the parser itself reads.
 *
 * The point is not to test the language — the language has its own suite. It is
 * to test that the DESCRIPTION of the language cannot drift from the language,
 * which is a different failure and a worse one: a wrong manifest is a confident
 * wrong answer, and nothing else in the project would notice.
 */

/** The manifest's own copy of a fresh known-good song, which every example is added to. */
function baseSong(): string {
  return SCRIPT_EXAMPLE;
}

describe('the capability manifest', () => {
  it('lists every command word the parser knows, in the parser\u2019s order', () => {
    expect(SCRIPT_COMMANDS.map((command) => command.word)).toEqual([...SCRIPT_KEYWORDS]);
  });

  it('gives every command a one-line purpose and an example', () => {
    const thin = SCRIPT_COMMANDS.filter((command) => command.what.trim().length < 10);
    expect(thin.map((command) => command.word)).toEqual([]);
    const unexplained = SCRIPT_COMMANDS.filter((command) => command.example.trim() === '');
    expect(unexplained.map((command) => command.word)).toEqual([]);
  });

  it('puts every command in exactly one tier', () => {
    const { core, deep } = scriptCapabilities().tiers;
    expect([...core, ...deep].sort()).toEqual([...SCRIPT_KEYWORDS].sort());
    expect(core.filter((word) => deep.includes(word))).toEqual([]);
    expect(core.length).toBeGreaterThan(0);
    expect(deep.length).toBeGreaterThan(0);
  });

  it('applies every published example to a real song without an error', () => {
    const failures: string[] = [];
    for (const command of SCRIPT_COMMANDS) {
      const result = applyScript(createSong(), `${baseSong()}\n\n${command.example}`);
      if (!result.ok) {
        failures.push(`${command.word}: ${command.example} -> ${result.errors.map((e) => e.message).join(' | ')}`);
      }
    }
    expect(failures.join('\n')).toBe('');
  });

  it('makes each example leave a song with notes in it, except the one that blanking a song means', () => {
    // `new` is the exception, and honestly so: its whole job is to leave an empty
    // song behind, so "produces notes" is the one promise it cannot keep. Every
    // other example is added to a song that already has notes, so a broken
    // example that silently swallowed the song would show up here.
    const silent: string[] = [];
    for (const command of SCRIPT_COMMANDS) {
      if (command.word === 'new') continue;
      const result = applyScript(createSong(), `${baseSong()}\n\n${command.example}`);
      if (result.ok && result.summary.notes === 0) silent.push(command.word);
    }
    expect(silent).toEqual([]);
  });

  it('publishes the file versions the format actually writes', () => {
    const { fileVersions } = scriptCapabilities();
    expect(fileVersions.plain).toBe(SONG_FILE_VERSION);
    expect(fileVersions.stacked).toBe(STACK_SONG_FILE_VERSION);
    expect(fileVersions.max).toBe(SONG_FILE_VERSION_MAX);
  });

  it('publishes the limits the parser enforces, not a second copy of them', () => {
    const { limits } = scriptCapabilities();
    expect(limits.tracks.min).toBe(MIN_TRACKS);
    expect(limits.tracks.max).toBe(MAX_TRACKS);
    expect(limits.bpm.min).toBe(BPM_MIN);
    expect(limits.bpm.max).toBe(BPM_MAX);
    expect(limits.layers.max).toBe(MAX_LAYERS);
    expect(limits.layers.extra).toBe(MAX_LAYERS - 1);
    // The drum machine's own ranges, from the constants the parser reads — so a
    // limit moved in the model and not here fails rather than being published wrong.
    expect(limits.machine.pads.max).toBe(MAX_PADS);
    expect(limits.machine.steps.min).toBe(MIN_MACHINE_STEPS);
    expect(limits.machine.steps.max).toBe(MAX_MACHINE_STEPS);
    expect(limits.machine.steps.atDefault).toBe(DEFAULT_MACHINE_STEPS);
    expect(limits.machine.beat.min).toBe(MIN_MACHINE_BEAT);
    expect(limits.machine.beat.max).toBe(MAX_MACHINE_BEAT);
    expect(limits.machine.bars.max).toBe(MAX_MACHINE_BARS);
  });

  it('says which language version it is, and what that version added', () => {
    const manifest = scriptCapabilities();
    expect(manifest.scriptVersion).toBe(SCRIPT_VERSION);
    expect(manifest.versionNotes.map((entry) => entry.version)).toContain(SCRIPT_VERSION);
    // Version 2 is the layer statement; a build that says 2 must therefore know
    // the word, which is exactly the question a tool asks before writing one.
    if (SCRIPT_VERSION >= 2) expect(manifest.keywords).toContain('layer');
  });

  it('hands out copies, so a reader cannot edit the language by accident', () => {
    const manifest = scriptCapabilities();
    (manifest.keywords as string[]).push('nonsense');
    manifest.limits.tracks.max = 99;
    expect(scriptCapabilities().keywords).not.toContain('nonsense');
    expect(scriptCapabilities().limits.tracks.max).toBe(MAX_TRACKS);
  });

  it('serializes to JSON, which is how a tool most often asks', () => {
    const parsed = JSON.parse(capabilitiesJson(0)) as { keywords: string[]; scriptVersion: number };
    expect(parsed.keywords).toEqual([...SCRIPT_KEYWORDS]);
    expect(parsed.scriptVersion).toBe(SCRIPT_VERSION);
  });
});

describe('the vocabulary the manifest publishes', () => {
  /** Every word the manifest offers, as a script line that should parse. */
  const accepted: readonly { what: string; word: string; line: string }[] = (() => {
    const { vocabulary } = scriptCapabilities();
    return [
      ...vocabulary.waves.map((wave) => ({ what: 'wave', word: wave, line: `track 1 wave ${wave}` })),
      ...vocabulary.voices.map((voice) => ({ what: 'voice', word: voice, line: `track 1 voice ${voice}` })),
      ...vocabulary.knobs.map((knob) => ({ what: 'knob', word: knob.id, line: `track 1 ${knob.id} 50` })),
      ...vocabulary.knobs.map((knob) => ({ what: 'layer knob', word: knob.id, line: `layer 1 2 ${knob.id} 50` })),
      ...vocabulary.layerFields.map((field) => ({
        what: 'layer field',
        word: field.id,
        line: `layer 1 2 ${field.id} ${Math.max(field.min, Math.min(field.max, 1))}`,
      })),
      ...vocabulary.tunings.map((tuning) => ({ what: 'tuning', word: tuning, line: `tuning ${tuning}` })),
      ...vocabulary.grooves.map((groove) => ({ what: 'groove', word: groove.id, line: `groove ${groove.id}` })),
      ...vocabulary.chips.map((chip) => ({ what: 'console', word: chip, line: `chip ${chip}` })),
      ...vocabulary.scales.map((scale) => ({ what: 'scale', word: scale, line: `key D ${scale}` })),
      ...vocabulary.chordModes.map((mode) => ({ what: 'chord mode', word: mode, line: `chords ${mode}` })),
      ...vocabulary.effects.map((effect) => ({ what: 'effect', word: effect, line: `track 1 ${effect} 40` })),
    ];
  })();

  it('accepts every word it publishes', () => {
    const rejected: string[] = [];
    for (const entry of accepted) {
      const result = applyScript(createSong(), `${baseSong()}\n\n${entry.line}`);
      if (!result.ok) {
        rejected.push(`${entry.what} "${entry.word}": ${entry.line} -> ${result.errors.map((e) => e.message).join(' | ')}`);
      }
    }
    expect(rejected.join('\n')).toBe('');
  });

  it('publishes the ten channel effects, and the range they share', () => {
    const { vocabulary, limits } = scriptCapabilities();
    expect(vocabulary.effects).toHaveLength(10);
    expect(limits.effect.min).toBe(0);
  });

  it('publishes all four things a layer is made of beyond the nine knobs', () => {
    expect(scriptCapabilities().vocabulary.layerFields.map((field) => field.id)).toEqual(['octave', 'detune', 'gain']);
  });
});
