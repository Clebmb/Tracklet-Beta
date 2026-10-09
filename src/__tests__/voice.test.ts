import { describe, expect, it } from 'vitest';

import {
  clampParam,
  copyVoice,
  DEFAULT_VOICE,
  isWaveName,
  MAX_PARAM,
  MAX_USER_VOICES,
  MAX_VOICE_NAME,
  MIN_PARAM,
  nextWave,
  parseUserVoices,
  sameVoice,
  tidyVoiceName,
  userVoiceFromName,
  userVoiceNames,
  VOICE_NAMES,
  VOICE_PARAM_BY_ID,
  VOICE_PARAMS,
  VOICES,
  voiceById,
  voiceForTrack,
  voiceFromName,
  voiceNameFor,
  voiceNameProblem,
  soundShortLabel,
  WAVES,
  WAVE_LABELS,
  waveForTrack,
  waveFromName,
  withUserVoice,
  withoutUserVoice,
  type StackedSound,
  type UserVoice,
  type VoiceParams,
} from '../model';

/**
 * The voice vocabulary, tested the way a beginner meets it: as a list of names
 * that must all work, and a set of knobs whose whole promise is that the range
 * is the guarantee — nothing you can dial is silent, painful or invalid.
 */

/** One layer's worth of sound: a voice, and no layers stacked above it. */
const plain = (params: VoiceParams): StackedSound => ({ voice: params, stack: [] });

describe('the voice list', () => {
  it('names every voice exactly once, and every label is a word a script can use', () => {
    const labels = VOICES.map((v) => v.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) {
      expect(label).toMatch(/^[a-z][a-z-]*$/);
      expect(voiceFromName(label)?.label).toBe(label);
    }
  });

  it('keeps every preset inside the range the knobs promise', () => {
    for (const voice of VOICES) {
      const params = voice.params;
      expect(WAVES).toContain(params.wave);
      for (const param of VOICE_PARAMS) {
        const value = params[param.id];
        expect(value).toBeGreaterThanOrEqual(MIN_PARAM);
        expect(value).toBeLessThanOrEqual(MAX_PARAM);
      }
    }
  });

  it('gives every voice a family, a blurb and a distinct sound', () => {
    for (const voice of VOICES) {
      expect(voice.blurb.length).toBeGreaterThan(10);
      expect(['lead', 'bass', 'harmony', 'percussion']).toContain(voice.family);
    }
    // Two presets that sound identical would be a name that lies, so the table
    // is checked for it rather than left to a careful reader.
    for (let i = 0; i < VOICES.length; i++) {
      for (let j = i + 1; j < VOICES.length; j++) {
        expect(sameVoice(VOICES[i].params, VOICES[j].params)).toBe(false);
      }
    }
  });

  it('reads a name forgivingly about case and strictly about meaning', () => {
    expect(voiceFromName('PAD')?.id).toBe('pad');
    expect(voiceFromName('  pluck ' )?.id).toBe('pluck');
    // A voice guessed wrongly still plays — as the wrong instrument — so a near
    // miss is refused rather than snapped to the nearest name.
    expect(voiceFromName('pads')).toBeNull();
    expect(voiceFromName('string')).toBeNull();
    expect(voiceFromName('')).toBeNull();
  });

  it('lists every name in the error text, so a refusal is also a menu', () => {
    for (const voice of VOICES) expect(VOICE_NAMES).toContain(voice.label);
  });

  it('finds a voice by id, and nothing by a wrong id', () => {
    expect(voiceById('snare')?.label).toBe('snare');
    expect(voiceById('SNARE')).toBeNull();
    expect(voiceById('nope')).toBeNull();
  });
});

describe('naming a sound', () => {
  it('round-trips every preset through its own name', () => {
    for (const voice of VOICES) {
      expect(voiceNameFor(voice.params)).toBe(voice.label);
    }
  });

  it('calls a sound with no name custom, the moment one knob moves', () => {
    const pad = voiceById('pad')!;
    expect(voiceNameFor(pad.params)).toBe('pad');
    const tweaked: VoiceParams = { ...pad.params, bright: pad.params.bright + 1 };
    expect(voiceNameFor(tweaked)).toBe('custom');
  });

  it('has a neutral default that is not secretly a preset', () => {
    expect(voiceNameFor(DEFAULT_VOICE)).toBe('custom');
  });

  it('shapes a new channel by its position, so four channels differ', () => {
    const waves = [0, 1, 2, 3].map((i) => voiceForTrack(i).wave);
    expect(new Set(waves).size).toBe(4);
    expect(voiceForTrack(4).wave).toBe(voiceForTrack(0).wave);
  });

  it('copies a sound rather than sharing it', () => {
    const copy = copyVoice(DEFAULT_VOICE);
    copy.bright = 10;
    expect(DEFAULT_VOICE.bright).not.toBe(10);
  });
});

describe('the knobs', () => {
  it('describes each one with a label, two named ends and a blurb', () => {
    for (const param of VOICE_PARAMS) {
      expect(param.label.length).toBeGreaterThan(0);
      expect(param.low).not.toBe(param.high);
      expect(param.blurb.length).toBeGreaterThan(20);
      expect(VOICE_PARAM_BY_ID[param.id]).toBe(param);
    }
  });

  it('clamps rather than throwing, because the range is the safety guarantee', () => {
    expect(clampParam(-40)).toBe(MIN_PARAM);
    expect(clampParam(500)).toBe(MAX_PARAM);
    expect(clampParam(63.4)).toBe(63);
    expect(clampParam(Number.NaN)).toBe(MIN_PARAM);
  });
});

describe('the waveform vocabulary', () => {
  it('accepts the short spellings a person actually writes', () => {
    expect(waveFromName('saw')).toBe('sawtooth');
    expect(waveFromName('SQR')).toBe('square');
    expect(waveFromName('pulse')).toBe('square');
    expect(waveFromName('sin')).toBe('sine');
    expect(waveFromName('noise')).toBe('noise');
    expect(waveFromName('wobble')).toBeNull();
    expect(isWaveName('triangle')).toBe(true);
    expect(isWaveName('nope')).toBe(false);
  });

  it('cycles through the shapes, and names each one short', () => {
    expect(nextWave('square')).toBe('triangle');
    expect(nextWave('sine')).toBe('noise');
    expect(nextWave('noise')).toBe('table');
    expect(nextWave('table')).toBe('sample');
    expect(nextWave('sample')).toBe('fm');
    expect(nextWave('fm')).toBe('string');
    expect(nextWave('string')).toBe('formant');
    expect(nextWave('formant')).toBe('organ');
    expect(nextWave('organ')).toBe('granular');
    expect(nextWave('granular')).toBe('font');
    expect(nextWave('font')).toBe('reed');
    expect(nextWave('reed')).toBe('brass');
    expect(nextWave('brass')).toBe('bow');
    expect(nextWave('bow')).toBe('mallet');
    expect(nextWave('mallet')).toBe('membrane');
    expect(nextWave('membrane')).toBe('plate');
    expect(nextWave('plate')).toBe('square');
    expect(waveForTrack(1)).toBe('triangle');
    // Two or three characters: 'FM' is the one shape whose name is two letters.
    for (const wave of WAVES) {
      expect(WAVE_LABELS[wave].length).toBeGreaterThanOrEqual(2);
      expect(WAVE_LABELS[wave].length).toBeLessThanOrEqual(3);
    }
  });
});

describe('your own saved sounds', () => {
  const mine = (name: string, params: VoiceParams = { ...DEFAULT_VOICE, bright: 40 }): UserVoice => ({
    name, params, stack: [],
  });

  it('closes up a typed name rather than refusing it', () => {
    expect(tidyVoiceName('  my pad ')).toBe('MY-PAD');
    expect(tidyVoiceName('warm strings')).toBe('WARM-STRINGS');
  });

  it('refuses a name that would be unreachable, unusable or confusing', () => {
    const library = [mine('MYPAD')];
    expect(voiceNameProblem('', library)).toContain('needs a name');
    expect(voiceNameProblem('X'.repeat(MAX_VOICE_NAME + 1), library)).toContain(`${MAX_VOICE_NAME} characters`);
    expect(voiceNameProblem('MY PAD!', library)).toContain('one word of letters');
    // A saved voice may not shadow a built-in one: a script naming `pad` must
    // keep meaning the app's pad.
    expect(voiceNameProblem('pad', library)).toContain('built-in');
    expect(voiceNameProblem('MYPAD', library)).toContain('already have');
    // ...but keeping the name you are editing is not a collision with yourself.
    expect(voiceNameProblem('MYPAD', library, 'MYPAD')).toBeNull();
    expect(voiceNameProblem('MYPAD', library)).not.toBeNull();
    expect(voiceNameProblem('BRASS', library)).toBeNull();
  });

  it('is addressed the way a built-in voice is: case does not matter', () => {
    const library = [mine('MYPAD')];
    expect(userVoiceFromName('mypad', library)?.name).toBe('MYPAD');
    expect(userVoiceFromName(' MYPAD ', library)?.name).toBe('MYPAD');
    expect(userVoiceFromName('PAD', library)).toBeNull();
  });

  it('appends a new sound, and replaces the one that already has its name', () => {
    const one = withUserVoice([], mine('MYPAD'));
    expect(one.map((v) => v.name)).toEqual(['MYPAD']);
    const two = withUserVoice(one, mine('BRASS'));
    expect(two.map((v) => v.name)).toEqual(['MYPAD', 'BRASS']);
    // Saving a tweaked MYPAD over MYPAD is the common case: you iterated.
    const tweaked = withUserVoice(two, mine('MYPAD', { ...DEFAULT_VOICE, bright: 99 }));
    expect(tweaked).toHaveLength(2);
    expect(userVoiceFromName('MYPAD', tweaked)?.params.bright).toBe(99);
  });

  it('copies a sound rather than sharing it, so a later edit cannot reach back', () => {
    const params = { ...DEFAULT_VOICE, bright: 40 };
    const library = withUserVoice([], { name: 'MYPAD', params, stack: [] });
    params.bright = 90;
    expect(library[0].params.bright).toBe(40);
  });

  it('stops taking NEW names at the ceiling, but still lets an existing one be replaced', () => {
    let library: UserVoice[] = [];
    for (let i = 0; i < MAX_USER_VOICES; i++) library = withUserVoice(library, mine(`V${i}`));
    expect(library).toHaveLength(MAX_USER_VOICES);
    expect(withUserVoice(library, mine('ONE-MORE'))).toHaveLength(MAX_USER_VOICES);
    const replaced = withUserVoice(library, mine('V0', { ...DEFAULT_VOICE, bright: 12 }));
    expect(replaced).toHaveLength(MAX_USER_VOICES);
    expect(userVoiceFromName('V0', replaced)?.params.bright).toBe(12);
  });

  it('forgets one by name, and forgets nothing for a name it never had', () => {
    const library = [mine('MYPAD'), mine('BRASS')];
    expect(withoutUserVoice(library, 'mypad').map((v) => v.name)).toEqual(['BRASS']);
    expect(withoutUserVoice(library, 'NOPE')).toHaveLength(2);
  });

  it('lists the names for an error message that has to name the fix', () => {
    expect(userVoiceNames([mine('MYPAD'), mine('BRASS')])).toBe('MYPAD, BRASS');
  });

  describe('a stored library is untrusted input', () => {
    it('reads a good one back whole', () => {
      const stored = [{ name: 'mypad', params: { wave: 'sawtooth', bright: 40, noise: 5 } }];
      const [voice] = parseUserVoices(stored);
      expect(voice.name).toBe('MYPAD');
      expect(voice.params).toEqual({ ...DEFAULT_VOICE, wave: 'sawtooth', bright: 40, noise: 5 });
    });

    it('drops what it cannot read instead of losing the whole library', () => {
      const stored = [
        null,
        'nonsense',
        { name: 42, params: { wave: 'sine' } },
        { name: 'NOSOUND', params: { wave: 'wobble' } },
        { name: 'NO-PARAMS' },
        { name: 'pad', params: { wave: 'sine' } },
        { name: '', params: { wave: 'sine' } },
        { name: 'GOOD', params: { wave: 'sine' } },
        { name: 'good', params: { wave: 'sawtooth' } },
      ];
      expect(parseUserVoices(stored).map((v) => v.name)).toEqual(['GOOD']);
    });

    it('clamps a knob written past its range rather than throwing the sound away', () => {
      const [voice] = parseUserVoices([{ name: 'LOUD', params: { wave: 'square', bright: 400, ring: -20 } }]);
      expect(voice.params.bright).toBe(MAX_PARAM);
      expect(voice.params.ring).toBe(MIN_PARAM);
    });

    it('is nothing at all when the value is not a list', () => {
      expect(parseUserVoices(null)).toEqual([]);
      expect(parseUserVoices({})).toEqual([]);
      expect(parseUserVoices('[]')).toEqual([]);
    });
  });
});

describe('the channel-row chip', () => {
  it('shows the voice name where there is one', () => {
    expect(soundShortLabel(plain(voiceById('pad')!.params))).toBe('PAD');
    expect(soundShortLabel(plain(voiceById('strings')!.params))).toBe('STR');
    expect(soundShortLabel(plain(voiceById('snare')!.params))).toBe('SNA');
  });

  it('shows a SAVED sound by its own name, when the caller knows the library', () => {
    const params: VoiceParams = { ...DEFAULT_VOICE, wave: 'sawtooth', bright: 64 };
    const library: UserVoice[] = [{ name: 'WARM-KEYS', params, stack: [] }];
    expect(voiceNameFor(params)).toBe('custom');
    expect(soundShortLabel(plain(params), library)).toBe('WAR');
    // Without the library there is no name to show, so the waveform is the
    // honest answer rather than an invented one.
    expect(soundShortLabel(plain(params), [])).toBe('SAW');
  });

  it('falls back to the waveform when the sound has no name', () => {
    const custom: VoiceParams = { ...DEFAULT_VOICE, wave: 'sawtooth', bright: 12 };
    expect(voiceNameFor(custom)).toBe('custom');
    expect(soundShortLabel(plain(custom))).toBe('SAW');
  });
});
