/**
 * Machine pads on a RECORDING — the drum machine's own `sample NAME`.
 *
 * A pad was always a GENERATOR: the same `VoiceParams` a channel has. This adds
 * the channel's other half, the reference to a recording of your own, so a pad can
 * be a break or a stab rather than only arithmetic. These tests hold the four
 * claims that make a SAMPLE PAD safe:
 *
 *   • the MODEL carries a pad's `sample` and reports it, and a machine of
 *     generators is untouched — every pad names nothing;
 *   • the SCRIPT takes the same `sample NAME` a track line does (`sample none`
 *     clears it), refuses a name that is not a name, and round-trips;
 *   • the FILE writes version 39 when a pad names a recording and every older
 *     version otherwise, and the name survives the round trip;
 *   • the ENGINE resolves a pad's name against the bank, and a name the bank
 *     lacks is the FALLBACK — null, which plays the built-in one-shot — rather
 *     than a failure.
 */

import { describe, expect, it } from 'vitest';

import {
  MACHINE_BARS_SONG_FILE_VERSION,
  MACHINE_PAD_SAMPLE_SONG_FILE_VERSION,
  MACHINE_SONG_FILE_VERSION,
  applyScript,
  createMachine,
  createSong,
  defaultPad,
  describeMachine,
  makeSample,
  sampleByName,
  songFromJson,
  songToJson,
  songToScript,
  type SampleBank,
  type Song,
} from '../model';
import { AudioEngine } from '../audio/engine';

/** A bank holding one recording called `BRK`, so a pad's name has a file behind it. */
function bank(): SampleBank {
  const made = makeSample('BRK', 44100, new Float32Array(2000).fill(0.25));
  if (!made.ok) throw new Error(made.error);
  return [made.sample];
}

/** A song whose machine's pad 2 is on `wave sample` and names `BRK`. */
function padOnSample(): Song {
  const song = createSong();
  const machine = createMachine(8);
  const pads = machine.pads.map((pad, index) =>
    index === 1
      ? { ...pad, name: 'BRK', voice: { ...pad.voice, wave: 'sample' as const }, sample: 'BRK' }
      : pad,
  );
  song.machine = { ...machine, pads };
  return song;
}

describe('a pad carries the recording it names', () => {
  it('seeds every pad with no recording', () => {
    for (let i = 1; i <= 8; i++) {
      expect(defaultPad(i, 8).sample).toBeNull();
    }
  });

  it('reports a pad sample through the description', () => {
    const machine = padOnSample().machine!;
    expect(describeMachine(machine).pads[1]?.sample).toBe('BRK');
    expect(describeMachine(createMachine(8)).pads[0]?.sample).toBeNull();
  });
});

describe('the script writes a pad on a recording', () => {
  it('sets and clears the name', () => {
    const song = createSong();
    const set = applyScript(song, 'new\ntracks 1\nmachine\npad 2 "BRK" wave sample sample BRK pattern "9..."');
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    expect(set.song.machine?.pads[1]?.sample).toBe('BRK');

    const cleared = applyScript(set.song, 'pad 2 sample none');
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.song.machine?.pads[1]?.sample).toBeNull();
  });

  it('refuses a value that is not a name', () => {
    const bad = applyScript(createSong(), 'machine\npad 2 sample 8bad');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors.map((error) => error.message).join(' ')).toContain('pad sample needs a name');
  });

  it('round-trips through SAVE AS SCRIPT', () => {
    const song = padOnSample();
    expect(songToScript(song)).toContain('sample BRK');
    const back = applyScript(createSong(), songToScript(song));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.machine?.pads[1]?.sample).toBe('BRK');
    expect(back.song.machine?.pads[1]?.voice.wave).toBe('sample');
  });
});

describe('the file says a pad is on a recording', () => {
  it('writes version 39 and round-trips the name', () => {
    const song = padOnSample();
    const json = songToJson(song);
    expect(JSON.parse(json).version).toBe(MACHINE_PAD_SAMPLE_SONG_FILE_VERSION);

    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.machine?.pads[1]?.sample).toBe('BRK');
  });

  it('still writes the older versions when no pad names one', () => {
    const oneBar = createSong();
    oneBar.machine = padOnSample().machine!;
    oneBar.machine = { ...oneBar.machine, pads: oneBar.machine.pads.map((pad) => ({ ...pad, sample: null })) };
    expect(JSON.parse(songToJson(oneBar)).version).toBe(MACHINE_SONG_FILE_VERSION);

    const barred = createSong();
    barred.machine = { ...oneBar.machine, bars: [oneBar.machine.pads.map((pad) => pad.steps.slice())] };
    expect(JSON.parse(songToJson(barred)).version).toBe(MACHINE_BARS_SONG_FILE_VERSION);
  });

  it('falls back to no recording when the name is not a name', () => {
    const song = padOnSample();
    const raw = JSON.parse(songToJson(song));
    raw.machine.pads[1].sample = '8bad';
    const parsed = songFromJson(JSON.stringify(raw));
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    // Lenient, like the rest of the machine: a pad that names nothing plays its
    // built-in one-shot rather than costing the song.
    expect(parsed.song.machine?.pads[1]?.sample).toBeNull();
  });
});

describe('the engine resolves a pad name against the bank', () => {
  it('points a pad at the recording the bank holds, or at null', () => {
    const engine = new AudioEngine();
    const samples = bank();
    engine.setSamples(samples, [null, null], ['BRK', 'MISSING']);
    expect(engine.machineSampleBank[0]).toBe(sampleByName(samples, 'BRK'));
    // A name the bank lacks is the FALLBACK, not an error.
    expect(engine.machineSampleBank[1]).toBeNull();
  });

  it('forgets its pad recordings when disposed', () => {
    const engine = new AudioEngine();
    engine.setSamples(bank(), [null], ['BRK']);
    engine.dispose();
    expect(engine.machineSampleBank).toEqual([]);
  });
});
