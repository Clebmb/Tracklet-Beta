import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  cycleLoudness,
  loudLabel,
  LOUDNESS_MAX,
  LOUDNESS_MIN,
  LOUDNESS_OFF_WORD,
  LOUDNESS_PRESETS,
  loudnessMeaning,
  loudnessReport,
  loudnessScript,
  LOUDNESS_WORD,
  SCRIPT_VERSION,
  SCRIPT_VERSION_NOTES,
  songToJson,
  songToScript,
} from '../model';
import { scriptCapabilities } from '../model/capabilities';
import {
  biquadGain,
  formatLufs,
  gainChannels,
  gainDecibels,
  gainPcm,
  integratedLoudness,
  kWeighting,
  LUFS_ABSOLUTE_GATE,
  LUFS_CEILING_DB,
  matchLoudness,
  samplePeak,
} from '../audio/lufs';

/**
 * The loudness target: the words, the statement, and the arithmetic behind them.
 *
 * The measurement is the part of this feature that can be WRONG IN A WAY NOBODY
 * NOTICES — a filter coefficient in the wrong place still produces a plausible
 * number, and the number is then written into a file somebody else's program
 * reads. So the first two tests here are the ones that matter most: the filter is
 * compared against the coefficients the standard PUBLISHES for 48 kHz, and the
 * number it produces for a tone whose loudness is known by definition is compared
 * against that definition. Everything after them is about the statement, which is
 * the easy half.
 */

// --- the measurement, checked against the standard --------------------------

/**
 * The K-weighting coefficients at 48 kHz, as printed in ITU-R BS.1770.
 *
 * They are the only published form of this filter, and the reason they are worth
 * a test: this file builds the filter from the standard's PARAMETERS so it can be
 * built at 44100 too, and the published table is the one thing that says the
 * derivation is the standard's and not an approximation of it.
 */
const PUBLISHED_48K = {
  shelf: { b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585 },
  highpass: { b0: 1, b1: -2, b2: 1, a1: -1.99004745483398, a2: 0.99007225036621 },
};

/** A sine, as the samples a render would hold. */
function sine(hz: number, seconds: number, amplitude: number, sampleRate = 44100): Float32Array {
  const frames = Math.round(seconds * sampleRate);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  return out;
}

/** Silence, then something: the shape that makes the gates do their work. */
function silence(seconds: number, sampleRate = 44100): Float32Array {
  return new Float32Array(Math.round(seconds * sampleRate));
}

/** A full-scale-ish peak with very little of it: loudness low, peak high. */
function burst(amplitude: number, seconds: number, sampleRate = 44100): Float32Array {
  return sine(1000, seconds, amplitude, sampleRate);
}

/** What a steady tone at this amplitude SHOULD measure: its own RMS in dBFS. */
function toneLufs(amplitude: number): number {
  return 20 * Math.log10(amplitude / Math.SQRT2);
}

describe('the K-weighting filter', () => {
  it('is the standard own coefficients at 48 kHz, whatever rate it is built for', () => {
    // The derivation is checked where the standard pins it down, which is what
    // licenses building it at any other rate.
    const built = kWeighting(48000);
    for (const stage of ['shelf', 'highpass'] as const) {
      const want = PUBLISHED_48K[stage];
      const got = built[stage];
      expect(Math.abs(got.b0 - want.b0)).toBeLessThan(1e-12);
      expect(Math.abs(got.b1 - want.b1)).toBeLessThan(1e-12);
      expect(Math.abs(got.b2 - want.b2)).toBeLessThan(1e-12);
      expect(Math.abs(got.a1 - want.a1)).toBeLessThan(1e-12);
      expect(Math.abs(got.a2 - want.a2)).toBeLessThan(1e-12);
    }
  });

  it('has its calibration at 1 kHz: the offset cancels the weighting there', () => {
    // The whole reason `LUFS_OFFSET` is -0.691: the cascade is +0.70 dB at 1 kHz,
    // and taking that back off is what makes a 1 kHz tone read its own level.
    for (const rate of [44100, 48000]) {
      const { shelf, highpass } = kWeighting(rate);
      const cascade = biquadGain(shelf, 1000, rate) * biquadGain(highpass, 1000, rate);
      expect(gainDecibels(cascade)).toBeCloseTo(0.7, 1);
    }
  });

  it('is a high shelf over a high-pass, at the frequencies the standard names', () => {
    const { shelf, highpass } = kWeighting(44100);
    // The shelf's plateau is its published +4 dB, reached well into the treble.
    expect(gainDecibels(biquadGain(shelf, 10000, 44100))).toBeCloseTo(4, 1);
    // A second-order high-pass is -6 dB at its own corner, and flat a decade above.
    expect(gainDecibels(biquadGain(highpass, 38.135, 44100))).toBeCloseTo(-6, 0);
    expect(gainDecibels(biquadGain(highpass, 10000, 44100))).toBeCloseTo(0, 1);
    // And 100 Hz arrives 1.13 dB quieter than it left, which is what the weighting
    // DOES to a bass line — the thing a peak meter cannot see and this can.
    expect(gainDecibels(biquadGain(highpass, 100, 44100))).toBeCloseTo(-1.13, 1);
  });
});

describe('the integrated loudness of a tone whose loudness is known', () => {
  it('reads its own RMS in dBFS, which is what the calibration buys', () => {
    // A 1 kHz tone is the signal the standard's own numbers are quoted for, so it
    // is the one signal whose answer is known without measuring anything.
    for (const amplitude of [0.5, 0.1]) {
      const measured = integratedLoudness([sine(1000, 1, amplitude)], 44100);
      expect(measured).not.toBeNull();
      expect(measured!).toBeCloseTo(toneLufs(amplitude), 1);
    }
  });

  it('reads the broadcast calibration tone as -23.0 LUFS', () => {
    // A 1 kHz sine at -20 dBFS is the tone every broadcast chain is lined up with,
    // and it is defined to read -23 LUFS: -23.01 dBFS RMS, plus the 0.01 dB the
    // filter's own calibration leaves. This is the number to check the whole
    // chain against, because it is the one number the industry agrees on.
    const tone = sine(1000, 2, 0.1);
    expect(integratedLoudness([tone], 44100)!).toBeCloseTo(-23.0, 1);
  });

  it('adds 3 LU for the same signal in both ears', () => {
    const one = integratedLoudness([sine(1000, 1, 0.3)], 44100)!;
    const two = integratedLoudness([sine(1000, 1, 0.3), sine(1000, 1, 0.3)], 44100)!;
    expect(two - one).toBeCloseTo(3.01, 1);
  });

  it('is silent about silence, rather than infinitely negative', () => {
    expect(integratedLoudness([silence(2)], 44100)).toBeNull();
    expect(integratedLoudness([], 44100)).toBeNull();
    expect(integratedLoudness([new Float32Array(0)], 44100)).toBeNull();
  });

  it('has no loudness for a signal below its own absolute gate', () => {
    // -80 dBFS is under the -70 LUFS floor, so it is a gap rather than programme.
    expect(integratedLoudness([sine(1000, 2, 10 ** (-80 / 20))], 44100)).toBeNull();
    expect(LUFS_ABSOLUTE_GATE).toBe(-70);
  });

  it('does not gate away a signal just above the floor', () => {
    // The other side of the same line, so the test above cannot pass by accident.
    expect(integratedLoudness([sine(1000, 2, 10 ** (-40 / 20))], 44100)).not.toBeNull();
  });

  it('lets a loud passage decide, not the silence after it', () => {
    // The relative gate is what this buys. Ungated, 1 second of tone followed by 8
    // seconds of near-silence would average out to about -21 LUFS, a number that
    // describes neither half; gated, the loud second is the song.
    const programme = new Float32Array(9 * 44100);
    programme.set(sine(1000, 1, 0.5));
    programme.set(sine(1000, 8, 0.005), 44100);
    const measured = integratedLoudness([programme], 44100)!;
    expect(measured).toBeGreaterThan(-13);
    expect(measured).toBeLessThan(-9);
  });

  it('measures a render shorter than one block, which is the only thing it can do', () => {
    // A 100 ms tone is under the standard's 400 ms window; the answer is that one
    // block, and it is still a loudness rather than a null.
    const short = sine(1000, 0.1, 0.5);
    expect(integratedLoudness([short], 44100)!).toBeCloseTo(toneLufs(0.5), 0);
  });

  it('leaves the audio it was handed alone', () => {
    // A measurement that changed the file would be the worst possible bug: the
    // export would come out weighted. This one filters a COPY.
    const audio = sine(1000, 1, 0.5);
    const before = audio.slice();
    integratedLoudness([audio], 44100);
    expect(Array.from(audio)).toEqual(Array.from(before));
  });
});

describe('the gain a target asks for', () => {
  it('lands a render on the target, and says what it measured', () => {
    const quiet = [sine(1000, 2, 0.05)];
    const match = matchLoudness(quiet, 44100, -14);
    expect(match.measured).not.toBeNull();
    expect(match.limited).toBe(false);
    expect(gainDecibels(match.gain)).toBeCloseTo(-14 - match.measured!, 2);
    // Measured rather than assumed: scaling and measuring again is the claim.
    const scaled = gainChannels(quiet, match.gain);
    expect(integratedLoudness(scaled, 44100)!).toBeCloseTo(-14, 1);
  });

  it('stops at the ceiling rather than clipping, and reports that it did', () => {
    // A signal with a high peak and a modest loudness: reaching the target would
    // need a gain whose peak goes past full scale, so the ceiling decides instead.
    const spiky = new Float32Array(3 * 44100);
    spiky.set(burst(0.99, 0.05));
    const match = matchLoudness([spiky], 44100, -9);
    expect(match.limited).toBe(true);
    expect(20 * Math.log10(samplePeak([spiky]) * match.gain)).toBeCloseTo(LUFS_CEILING_DB, 2);
    // And the file still cannot clip, which is the point of stopping.
    expect(samplePeak(gainChannels([spiky], match.gain))).toBeLessThanOrEqual(10 ** (LUFS_CEILING_DB / 20) + 1e-9);
  });

  it('leaves a silent render at unity rather than dividing by nothing', () => {
    const match = matchLoudness([silence(1)], 44100, -14);
    expect(match).toEqual({ gain: 1, measured: null, limited: false });
  });

  it('needs no gain at all when the render is already there', () => {
    const audio = [sine(1000, 2, 0.1)];
    const target = integratedLoudness(audio, 44100)!;
    const match = matchLoudness(audio, 44100, Math.round(target * 10) / 10);
    expect(gainDecibels(match.gain)).toBeCloseTo(0, 1);
  });
});

describe('scaling a render', () => {
  it('is a copy, so nothing is scaled twice by accident', () => {
    const audio = sine(1000, 0.5, 0.5);
    const scaled = gainChannels([audio], 1)[0]!;
    expect(scaled).not.toBe(audio);
    expect(Array.from(scaled)).toEqual(Array.from(audio));
  });

  it('moves the samples and nothing else', () => {
    const audio = sine(1000, 0.5, 0.5);
    const doubled = gainChannels([audio], 2)[0]!;
    expect(doubled[100]).toBeCloseTo((audio[100] ?? 0) * 2, 6);
    expect(samplePeak([doubled])).toBeCloseTo(samplePeak([audio]) * 2, 6);
  });

  it('speaks the renderer\u2019s own shape too', () => {
    const pcm = { channels: [sine(1000, 0.5, 0.5)], sampleRate: 44100 };
    const quiet = gainPcm(pcm, 0.5);
    expect(quiet.sampleRate).toBe(44100);
    expect(samplePeak(quiet.channels)).toBeCloseTo(samplePeak(pcm.channels) * 0.5, 6);
  });

  it('prints a gain in decibels, with unity at zero', () => {
    expect(gainDecibels(1)).toBe(0);
    expect(gainDecibels(2)).toBeCloseTo(6.0206, 3);
  });
});

// --- what the app says about it --------------------------------------------

describe('the words', () => {
  it('calls the clause and its off switch what the language calls them', () => {
    expect(LOUDNESS_WORD).toBe('loud');
    expect(LOUDNESS_OFF_WORD).toBe('off');
    expect(loudnessScript(-14)).toBe('export loud -14');
  });

  it('prints a target, or the fact that there is not one', () => {
    expect(loudLabel(null)).toBe('OFF');
    expect(loudLabel(undefined)).toBe('OFF');
    expect(loudLabel(-14)).toBe('-14 LUFS');
    expect(formatLufs(-13.975)).toBe('-14.0 LUFS');
  });

  it('names what each published target is for', () => {
    expect(loudnessMeaning(-23)).toBe('broadcast');
    expect(loudnessMeaning(-16)).toBe('podcast');
    expect(loudnessMeaning(-14)).toBe('streaming');
    expect(loudnessMeaning(-9)).toBe('loud');
    expect(loudnessMeaning(-12)).toBe('a target of your own');
  });

  it('walks a ladder from off, up through the published targets, and back to off', () => {
    // One press LOUDER, and off the top of the ladder. This is a rule, so it is a
    // function and a test rather than a switch inside a menu.
    expect(cycleLoudness(null)).toBe(LOUDNESS_PRESETS[0]!.value);
    expect(cycleLoudness(-23)).toBe(-16);
    expect(cycleLoudness(-16)).toBe(-14);
    expect(cycleLoudness(-14)).toBe(-9);
    expect(cycleLoudness(-9)).toBeNull();
  });

  it('climbs from a target a script chose that is not one of the stops', () => {
    // `export loud -12` sits between -14 and -9, and the next stop above it is -9;
    // a target quieter than every stop climbs to the quietest one.
    expect(cycleLoudness(-12)).toBe(-9);
    expect(cycleLoudness(-30)).toBe(-23);
    expect(cycleLoudness(LOUDNESS_MAX - 1)).toBeNull();
  });

  it('says what a normalise did, and admits when the ceiling stopped it', () => {
    expect(loudnessReport(-22.4, -14, 8.4, false)).toBe('NORMALISED  -22.4 LUFS  ->  -14.0 LUFS  (+8.4 dB)');
    expect(loudnessReport(-9.2, -14, -4.8, false)).toBe('NORMALISED  -9.2 LUFS  ->  -14.0 LUFS  (-4.8 dB)');
    expect(loudnessReport(-9.2, -14, -2.1, true)).toContain('stopped before clipping');
  });
});

// --- the statement ----------------------------------------------------------

describe('the export statement', () => {
  const settingsOf = (source: string) => {
    const result = applyScript(createSong(), source);
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('\n'));
    return result;
  };

  it('sets a loudness target on its own', () => {
    const result = settingsOf('export loud -14\n');
    expect(result.settings.loud).toBe(-14);
    // And says NOTHING about a region, so a region an earlier line set survives.
    expect(result.settings.bounce).toBeUndefined();
  });

  it('sets both halves of an export in one line, in either order', () => {
    for (const line of ['export bars 2 to 3 loud -14', 'export loud -14 bars 2 to 3']) {
      const result = settingsOf(`${line}\n`);
      expect(result.settings.bounce).toEqual({ from: 2, to: 3 });
      expect(result.settings.loud).toBe(-14);
    }
  });

  it('takes `off` as a value rather than as silence', () => {
    expect(settingsOf('export loud -14\nexport loud off\n').settings.loud).toBeNull();
    const both = settingsOf('export bars 2 to 3 loud -14\nexport all loud off\n');
    expect(both.settings.bounce).toBeNull();
    expect(both.settings.loud).toBeNull();
  });

  it('leaves a region alone when a later line only moves the target', () => {
    const result = settingsOf('export bars 4 to 6\nexport loud -16\n');
    expect(result.settings.bounce).toEqual({ from: 4, to: 6 });
    expect(result.settings.loud).toBe(-16);
  });

  it('lets the last line win, like every other setting', () => {
    expect(settingsOf('export loud -14\nexport loud -9\n').settings.loud).toBe(-9);
  });

  it('takes a fraction of a decibel, because a target is a measurement', () => {
    expect(settingsOf('export loud -14.5\n').settings.loud).toBe(-14.5);
  });

  it('changes no byte of the song file, because a target is not song data', () => {
    const plain = createSong();
    const result = applyScript(plain, 'new\nexport bars 1 to 2 loud -14\n');
    if (!result.ok) throw new Error('this script should apply.');
    const untouched = applyScript(createSong(), 'new\n');
    if (!untouched.ok) throw new Error('the control script should apply.');
    expect(songToJson(result.song, { volume: null })).toBe(songToJson(untouched.song, { volume: null }));
    expect(songToScript(result.song, { volume: null })).toBe(songToScript(untouched.song, { volume: null }));
  });
});

describe('the refusals', () => {
  const refuse = (source: string): string => {
    const result = applyScript(createSong(), source);
    if (result.ok) throw new Error('this script applies, so it is not a refusal.');
    return result.errors.map((error) => error.message).join('\n');
  };

  it('asks for something to set when a line says only `export`', () => {
    expect(refuse('export\n')).toContain('export needs something to set');
  });

  it('refuses a target that is not a number', () => {
    expect(refuse('export loud\n')).toContain('export loud needs a target in dB');
    expect(refuse('export loud louder\n')).toContain('export loud needs a target in dB');
  });

  it('refuses a target outside the range a loudness can be in', () => {
    expect(refuse('export loud -60\n')).toContain(`is outside ${LOUDNESS_MIN} to ${LOUDNESS_MAX} LUFS`);
    expect(refuse(`export loud ${LOUDNESS_MAX + 1}\n`)).toContain('is outside');
    expect(refuse('export loud 14\n')).toContain('is outside');
  });

  it('keeps the limits the manifest publishes, so they cannot drift apart', () => {
    const manifest = scriptCapabilities();
    expect(manifest.scriptVersion).toBe(SCRIPT_VERSION);
    // AT LEAST, not exactly: loudness was the newest thing when this test was
    // written, and a language version is a history — a later bump must not have to
    // come back and edit this line. (The NEWEST feature's own suite asserts the
    // exact number.)
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(20);
    expect(SCRIPT_VERSION_NOTES.find((entry) => entry.version === 20)?.note).toContain('LOUDNESS TARGET');
    // The two ends of the range are the ones this file refuses at, and the range
    // is what the error message quotes — so they are asserted rather than assumed.
    expect(LOUDNESS_MIN).toBe(-40);
    expect(LOUDNESS_MAX).toBe(-5);
  });

  it('documents the clause on the command it belongs to', () => {
    const row = scriptCapabilities().commands.find((command) => command.word === 'export');
    expect(row?.what).toContain('loud');
    expect(row?.example).toContain('loud');
  });

  it('refuses anything left over, whichever clause was half-finished', () => {
    expect(refuse('export 8 to 15\n')).toContain('export takes nothing else after that');
    expect(refuse('export all loud -14 extra\n')).toContain('export takes nothing else after that');
    expect(refuse('export bars 1 to 2 bars 3 to 4\n')).toContain('export takes nothing else after that');
    expect(refuse('export loud -14 loud -9\n')).toContain('export takes nothing else after that');
    expect(refuse('export bars 1 to 2 loud\n')).toContain('export loud needs a target in dB');
  });

  it('still refuses a bar range that is not two whole bars', () => {
    expect(refuse('export bars 8\n')).toContain('two whole bar numbers');
    expect(refuse('export bars 1 to 2.5\n')).toContain('two whole bar numbers');
    expect(refuse('export bars 0 to 4\n')).toContain('bars are counted from 1');
    expect(refuse('export bars 15 to 8\n')).toContain('counts backwards');
  });

  it('names its own line', () => {
    const result = applyScript(createSong(), 'new\nexport loud -60\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.line).toBe(2);
  });
});
