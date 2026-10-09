import { describe, expect, it } from 'vitest';

import {
  CHIPS,
  chipById,
  chipFromName,
  chipNameFor,
  chipNames,
  chipVoiceFor,
  createSong,
  DEFAULT_VOICE,
  type VoiceParams,
} from '../model';
import { applyScript } from '../model/script';
import { songFromJson, songToJson } from '../model/songfile';

/**
 * The console profiles, tested as the promise `model/chip.ts` makes: a chip is a
 * way to SET the voices, the voices are the truth, and the label is DERIVED from
 * them rather than remembered.
 *
 * So the tests come in three parts: the profiles themselves (a NES really is two
 * pulses, a triangle and a noise, in that order), the `chip` command laying them
 * over a song, and the round trip — the resulting sound survives a file, because
 * a file carries voices and a chip was only ever a shortcut to them.
 */

function applied(source: string, song = createSong()) {
  const result = applyScript(song, source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('the profiles', () => {
  it('names the consoles, each once', () => {
    expect(CHIPS.map((c) => c.id)).toEqual(['nes', 'gb', 'pce', 'snes', 'gba', 'genesis', 'opl']);
    expect(new Set(CHIPS.map((c) => c.id)).size).toBe(CHIPS.length);
    expect(chipNames()).toContain('nes');
    expect(chipNames()).toContain('genesis');
  });

  it('reads the names a person actually writes', () => {
    expect(chipFromName('famicom')?.id).toBe('nes');
    expect(chipFromName('gameboy')?.id).toBe('gb');
    expect(chipFromName('tg16')?.id).toBe('pce');
    expect(chipFromName('super-nes')?.id).toBe('snes');
    expect(chipFromName('advance')?.id).toBe('gba');
    expect(chipFromName('megadrive')?.id).toBe('genesis');
    expect(chipFromName('adlib')?.id).toBe('opl');
    expect(chipFromName('dreamcast')).toBeNull();
    expect(chipById('nes')?.label).toBe('NES');
  });

  it('gives the NES its four channels in order: two pulses, a triangle, a noise', () => {
    const nes = chipById('nes')!;
    expect(nes.roles.map((r) => r.wave)).toEqual(['square', 'square', 'triangle', 'noise']);
    // The pulse channels are actually narrowed, so this is a chip lead not a synth.
    expect(nes.roles[0].duty).toBeLessThan(100);
    expect(nes.roles[1].duty).toBeLessThan(nes.roles[0].duty);
    // And the drums are the noise register, not a tone with hiss mixed in.
    expect(nes.roles[3].wave).toBe('noise');
    expect(nes.roles[3].noise).toBe(0);
  });

  it('cycles the line-up when a song is wider than the console', () => {
    const nes = chipById('nes')!;
    expect(chipVoiceFor(nes, 0)).toEqual(nes.roles[0]);
    expect(chipVoiceFor(nes, 4)).toEqual(nes.roles[0]);
    expect(chipVoiceFor(nes, 6)).toEqual(nes.roles[2]);
    // A copy, not the table's own object: a per-channel tweak must not edit the profile.
    expect(chipVoiceFor(nes, 0)).not.toBe(nes.roles[0]);
  });
});

describe('detecting the chip a song is', () => {
  it('reads a profile back from the voices, and forgets it the moment one moves', () => {
    const nes = chipById('nes')!;
    const voices = nes.roles.map((r) => ({ ...r }));
    expect(chipNameFor(voices)).toBe('nes');

    const tweaked: VoiceParams[] = voices.map((v) => ({ ...v }));
    tweaked[0] = { ...tweaked[0], bright: 20 };
    expect(chipNameFor(tweaked)).toBeNull();

    // A song that is nothing like a console is honestly nothing.
    expect(chipNameFor([{ ...DEFAULT_VOICE }])).toBeNull();
  });
});

describe('the chip command', () => {
  it('lays a console over every channel of the song', () => {
    const { song } = applied('tracks 4\nchip nes');
    expect(song.tracks.map((t) => t.voice.wave)).toEqual(['square', 'square', 'triangle', 'noise']);
    expect(chipNameFor(song.tracks.map((t) => t.voice))).toBe('nes');
  });

  it('accepts the friendly spellings and refuses anything else with the list', () => {
    expect(applied('tracks 2\nchip gameboy').song.tracks[0].voice).toEqual(chipById('gb')!.roles[0]);

    const bad = applyScript(createSong(), 'tracks 2\nchip dreamcast');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('nes');
  });

  it('leaves the channels it did not have a role for alone in name, and cycles the sound', () => {
    const { song } = applied('tracks 6\nchip nes');
    expect(song.tracks.length).toBe(6);
    expect(song.tracks[4].voice).toEqual(chipById('nes')!.roles[0]);
    expect(song.tracks[5].voice).toEqual(chipById('nes')!.roles[1]);
  });

  it('is a starting point: a later line can tune one channel off the profile', () => {
    const { song } = applied('tracks 4\nchip nes\ntrack 1 "LEAD" bright 95');
    expect(song.tracks[0].voice.bright).toBe(95);
    // And then it is honestly no longer simply "a NES".
    expect(chipNameFor(song.tracks.map((t) => t.voice))).toBeNull();
  });
});

describe('a chipped song is just voices, so it travels as one', () => {
  it('round-trips a chip through a file without a chip field', () => {
    const { song } = applied('tracks 4\nchip gb');
    const json = songToJson(song);
    expect(json).not.toContain('"chip"');

    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks.map((t) => t.voice.wave)).toEqual(['square', 'square', 'table', 'noise']);
    expect(chipNameFor(parsed.song.tracks.map((t) => t.voice))).toBe('gb');
  });
});
