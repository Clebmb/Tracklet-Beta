import { describe, expect, it } from 'vitest';

import { AudioEngine } from '../audio/engine';
import {
  applyScript,
  automatedPluginParams,
  automationTargetInfo,
  createSong,
  isAutomationTarget,
  laneLabel,
  songFromJson,
  songToJson,
  songToScript,
  SCRIPT_KEYWORDS,
  SCRIPT_QUICK_REFERENCE,
  SONG_FILE_VERSION_MAX,
} from '../model';
import { SCRIPT_COMMANDS } from '../model/capabilities';
import { BUILT_IN_INSTRUMENTS } from '../plugins/builtIn';
import { applyPresetValues, coerceParamValues, paramRowLabel, paramRows, parsePreset } from '../plugins/params';
import {
  presetAbout,
  presetFileName,
  presetFromJson,
  presetNameFromFile,
  presetToJson,
  tidyPresetName,
  PRESET_FILE_EXTENSION,
  PRESET_NAME_FALLBACK,
} from '../model/presetfile';

function supersaw() {
  const found = BUILT_IN_INSTRUMENTS.find((plugin) => plugin.manifest.id === 'com.example.supersaw');
  if (!found) throw new Error('the bundled supersaw is missing');
  return found;
}

/** Apply and narrow to the success branch, failing loudly otherwise. */
function applied(source: string, song = createSong()) {
  const result = applyScript(song, source);
  if (!result.ok) {
    throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  }
  return result;
}

/** Apply and expect the failure branch, so a refusal can be inspected. */
function refused(source: string, song = createSong()) {
  const result = applyScript(song, source);
  if (result.ok) throw new Error('expected the script to be refused, but it applied');
  return result;
}

describe('live param values', () => {
  it('defaults every knob, clamps strangers, and drops unknown ids', () => {
    const manifest = supersaw().manifest;
    expect(coerceParamValues(manifest, undefined)).toEqual({ detune: 40, decay: 60 });
    expect(coerceParamValues(manifest, null)).toEqual({ detune: 40, decay: 60 });
    expect(coerceParamValues(manifest, { detune: 90, decay: 'loud', cutoff: 10 })).toEqual({
      detune: 90,
      decay: 60,
    });
    expect(coerceParamValues(manifest, { detune: 140, decay: -5 })).toEqual({ detune: 100, decay: 0 });
  });

  it('draws one honest row per knob', () => {
    const rows = paramRows(supersaw().manifest, { detune: 72 });
    expect(rows.map((row) => row.id)).toEqual(['detune', 'decay']);
    expect(paramRowLabel(rows[0]!)).toBe('Detune 72 (0-100)');
    expect(rows[1]!.value).toBe(60);
  });

  it('reads a preset for its own plugin and refuses anyone else\u2019s', () => {
    const manifest = supersaw().manifest;
    expect(parsePreset(manifest, { plugin: manifest.id, values: { detune: 10 } })).toEqual({
      plugin: manifest.id,
      values: { detune: 10, decay: 60 },
    });
    expect(parsePreset(manifest, { plugin: 'com.example.ep-piano', values: {} })).toBeNull();
    expect(parsePreset(manifest, 'nope')).toBeNull();
  });
});

describe('the engine holds live values per channel', () => {
  it('stores what it is given and defaults the rest to null', () => {
    const engine = new AudioEngine();
    engine.setPluginParams([{ detune: 80 }, null]);
    expect(engine.pluginParamBank).toEqual([{ detune: 80 }, null]);
    engine.setPluginParams([]);
    expect(engine.pluginParamBank).toEqual([]);
  });
});

describe('the params word', () => {
  it('turns one knob per line, keeping ids no manifest declares', () => {
    const { song } = applied('params 1 cutoff 70');
    expect(song.tracks[0]!.pluginParams).toEqual({ cutoff: 70 });
    const { song: both } = applied('params 1 cutoff 70\nparams 1 decay 45');
    expect(both.tracks[0]!.pluginParams).toEqual({ cutoff: 70, decay: 45 });
    // A retune overwrites; a channel that never turned a knob carries null.
    const { song: retuned } = applied('params 1 cutoff 70\nparams 1 cutoff 20');
    expect(retuned.tracks[0]!.pluginParams).toEqual({ cutoff: 20 });
    expect(createSong().tracks[0]!.pluginParams).toBeNull();
  });

  it('takes one knob off, or every override', () => {
    const { song } = applied('params 1 cutoff 70\nparams 1 decay 45\nparams 1 cutoff clear');
    expect(song.tracks[0]!.pluginParams).toEqual({ decay: 45 });
    const { song: cleared } = applied('params 1 cutoff 70\nparams 1 clear');
    expect(cleared.tracks[0]!.pluginParams).toBeNull();
  });

  it('refuses a bad channel, a bad knob, a bad value and a second knob', () => {
    expect(refused('params 9 cutoff 70').errors[0]!.message).toContain('channel number');
    expect(refused('params 1 CUTOFF 70').errors[0]!.message).toContain('lowercase');
    expect(refused('params 1 cutoff loud').errors[0]!.message).toContain('0..100');
    expect(refused('params 1 cutoff 140').errors[0]!.message).toContain('0..100');
    expect(refused('params 1 cutoff 70 extra').errors[0]!.message).toContain('extra');
    expect(refused('params 1').errors[0]!.message).toContain('one knob per line');
  });

  it('is in the language and the cheat sheet, beside fx', () => {
    expect(SCRIPT_KEYWORDS).toContain('params');
    expect(SCRIPT_KEYWORDS.indexOf('params')).toBe(SCRIPT_KEYWORDS.indexOf('fx') + 1);
    expect(SCRIPT_QUICK_REFERENCE.join(' ')).toContain('params');
  });
});

describe('params in a file', () => {
  it('writes version 46 with a pluginParams key, and reads it back', () => {
    expect(SONG_FILE_VERSION_MAX).toBe(46);
    const plain = JSON.parse(songToJson(createSong())) as { version: number; tracks: Record<string, unknown>[] };
    expect(plain.version).toBeLessThan(46);
    for (const track of plain.tracks) expect('pluginParams' in track).toBe(false);

    const song = createSong();
    song.tracks[0]!.pluginParams = { cutoff: 70 };
    const json = songToJson(song);
    expect(JSON.parse(json).version).toBe(46);
    expect(JSON.parse(json).tracks[0].pluginParams).toEqual({ cutoff: 70 });
    expect(songToScript(song)).toContain('params 1 cutoff 70');

    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0]!.pluginParams).toEqual({ cutoff: 70 });
  });

  it('reads a file written before knobs as manifest defaults', () => {
    const file = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const parsed = songFromJson(JSON.stringify(file));
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.tracks[0]!.pluginParams).toBeNull();
  });

  it('refuses a malformed map but clamps a confident number', () => {
    const file = JSON.parse(songToJson(createSong())) as { tracks: { pluginParams?: unknown }[] };
    const bad = (values: unknown) => {
      file.tracks[0]!.pluginParams = values;
      return songFromJson(JSON.stringify(file));
    };
    expect(bad(42).ok).toBe(false);
    expect(bad({ CUTOFF: 70 }).ok).toBe(false);
    expect(bad({ cutoff: 'loud' }).ok).toBe(false);
    const clamped = bad({ cutoff: 400 });
    if (!clamped.ok) throw new Error(clamped.errors.join(' / '));
    expect(clamped.song.tracks[0]!.pluginParams).toEqual({ cutoff: 100 });
  });
});

describe('param lanes', () => {
  it('moves a plugin knob across bars from words', () => {
    const { song } = applied('automate 1 param.cutoff 20 90 bars 1 to 2');
    expect(song.automation).toHaveLength(1);
    expect(song.automation[0]).toMatchObject({ track: 1, target: 'param.cutoff', from: 20, to: 90 });
    expect(songToScript(song)).toContain('automate 1 param.cutoff 20 90 bars 1 to 2');
  });

  it('describes a knob target like a table row, 0..100', () => {
    expect(automationTargetInfo('param.cutoff')).toMatchObject({
      label: 'PARAM CUTOFF',
      scope: 'note',
      min: 0,
      max: 100,
    });
    expect(automationTargetInfo('bright')?.label).toBe('BRIGHT');
    expect(automationTargetInfo('not-a-target')).toBeNull();
    expect(automationTargetInfo('param.Cutoff')).toBeNull();
  });

  it('names knob targets beside the fixed ones, and labels them', () => {
    expect(isAutomationTarget('param.cutoff')).toBe(true);
    expect(isAutomationTarget('param.cut_off2')).toBe(true);
    expect(isAutomationTarget('param.')).toBe(false);
    expect(isAutomationTarget('param.Cutoff')).toBe(false);
    expect(isAutomationTarget('param.cut off')).toBe(false);
    expect(isAutomationTarget('bright')).toBe(true);
    expect(laneLabel({ track: 2, target: 'param.cutoff', from: 20, to: 90, startBar: 8, endBar: 15 })).toBe(
      'CH 2 PARAM CUTOFF 20 -> 90 · BARS 8-15',
    );
  });

  it('walks only the lanes\u2019 knobs over the channel\u2019s own values', () => {
    const lanes = [
      { track: 1, target: 'param.cutoff' as const, from: 20, to: 80, startBar: 1, endBar: 1 },
    ];
    expect(automatedPluginParams({ cutoff: 10, decay: 45 }, [], 1, 0, 16)).toBeNull();
    expect(automatedPluginParams({ cutoff: 10, decay: 45 }, lanes, 1, 0, 16)).toEqual({ cutoff: 20, decay: 45 });
    // Before the lane starts: nothing to say, so the base plays untouched.
    expect(automatedPluginParams({ cutoff: 10 }, [{ ...lanes[0]!, startBar: 2, endBar: 2 }], 1, 0, 16)).toBeNull();
    // Another channel's lane is another channel's business.
    expect(automatedPluginParams({ cutoff: 10 }, [{ ...lanes[0]!, track: 2 }], 1, 0, 16)).toBeNull();
  });
});

describe('a preset file', () => {
  it('round-trips the plugin and its values', () => {
    const text = presetToJson({ name: 'WARM', plugin: 'com.example.supersaw', values: { detune: 72 } });
    const read = presetFromJson(text);
    if (!read.ok) throw new Error(read.errors.join(' / '));
    expect(read).toEqual({ ok: true, name: 'WARM', plugin: 'com.example.supersaw', values: { detune: 72 } });
  });

  it('refuses another format, a newer version and a bad map', () => {
    expect(presetFromJson('{"format": "tracklet-patch", "version": 1}').ok).toBe(false);
    expect(presetFromJson('{"format": "tracklet-plugin-preset", "version": 99, "plugin": "x", "values": {}}').ok).toBe(false);
    expect(presetFromJson('{"format": "tracklet-plugin-preset", "version": 1, "plugin": "x"}').ok).toBe(true);
    const bad = presetFromJson('{"format": "tracklet-plugin-preset", "version": 1, "plugin": "x", "values": {"cutoff": "loud"}}');
    expect(bad.ok).toBe(false);
  });

  it('clamps a confident number and falls back on a nameless file', () => {
    const read = presetFromJson('{"format": "tracklet-plugin-preset", "version": 1, "plugin": "x", "values": {"cutoff": 400}}');
    if (!read.ok) throw new Error(read.errors.join(' / '));
    expect(read.values).toEqual({ cutoff: 100 });
    expect(read.name).toBe(PRESET_NAME_FALLBACK);
    expect(tidyPresetName('  warm pad  ')).toBe('WARM PAD');
    expect(presetNameFromFile('warm-pad.pluginpatch.json')).toBe('WARM PAD');
    expect(presetFileName('WARM PAD')).toBe(`warm-pad${PRESET_FILE_EXTENSION}`);
    expect(presetAbout({ plugin: 'com.example.supersaw', values: { detune: 72, decay: 45 } })).toBe(
      '2 knobs for com.example.supersaw',
    );
  });

  it('applies sparsely: drops unknown knobs, clamps to the manifest, passes code-less maps through', () => {
    const manifest = supersaw().manifest;
    expect(applyPresetValues(manifest, { detune: 90, newer_knob: 5 })).toEqual({ detune: 90 });
    expect(applyPresetValues(manifest, { detune: 400 })).toEqual({ detune: 100 });
    expect(applyPresetValues(manifest, {})).toEqual({});
    expect(applyPresetValues(null, { detune: 90, newer_knob: 5 })).toEqual({ detune: 90, newer_knob: 5 });
  });
});

describe('the manifest publishes params', () => {
  it('lists the word after fx with an example that applies', () => {
    const words = SCRIPT_COMMANDS.map((command) => command.word);
    expect(words.indexOf('params')).toBe(words.indexOf('fx') + 1);
    const entry = SCRIPT_COMMANDS.find((command) => command.word === 'params');
    expect(entry?.example).toBe('params 1 cutoff 70');
    applied(entry!.example);
  });
});
