import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  emptyTrack,
  PLUGIN_SONG_FILE_VERSION,
  songFromJson,
  SONG_FILE_VERSION,
  songToJson,
  songToScript,
} from '../model';

/** Apply a fragment, throwing the refusal's own message on failure. */
function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' / '));
  return result.song;
}

describe('plugin instruments on channels', () => {
  it('starts unnamed: a fresh channel names no plugin', () => {
    expect(emptyTrack(0).plugin).toBeNull();
  });

  it('seats a plugin with `voice plugin:<id>` and keeps the fallback sound', () => {
    const song = applied('track 1 voice plugin:com.example.supersaw');
    expect(song.tracks[0].plugin).toBe('com.example.supersaw');
    // The voice underneath is untouched: it is what plays where the plugin is missing.
    expect(song.tracks[0].voice).toEqual(emptyTrack(0).voice);
  });

  it('lets knobs shape the fallback beside the plugin, in either order', () => {
    expect(applied('track 1 voice plugin:com.example.supersaw bright 90').tracks[0].voice.bright).toBe(90);
    expect(applied('track 1 bright 90 voice plugin:com.example.supersaw').tracks[0].voice.bright).toBe(90);
  });

  it('refuses a malformed reference with the existing voice refusal', () => {
    const result = applyScript(createSong(), 'track 1 voice plugin:');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].message).toContain('is not a voice');
  });

  it('writes the plugin AS the voice word, and reads its own writing back', () => {
    const song = applied('track 1 voice plugin:com.example.supersaw\npattern 1 "A"\nC-4');
    const text = songToScript(song);
    expect(text).toContain('voice plugin:com.example.supersaw');
    const reread = applied(text);
    expect(reread.tracks[0].plugin).toBe('com.example.supersaw');
  });
});

describe('plugin instruments in song files', () => {
  it('writes version 43 only when a channel names one', () => {
    const plain = applied('track 1 voice lead');
    expect(JSON.parse(songToJson(plain)).version).toBe(SONG_FILE_VERSION);
    const plugined = applied('track 1 voice plugin:com.example.supersaw');
    expect(JSON.parse(songToJson(plugined)).version).toBe(PLUGIN_SONG_FILE_VERSION);
  });

  it('round-trips the reference through JSON', () => {
    const song = applied('track 1 voice plugin:com.example.supersaw');
    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.song.tracks[0].plugin).toBe('com.example.supersaw');
  });

  it('reads an unknown id without refusing: fallback is the engine\u2019s business', () => {
    const song = applied('track 1 voice lead');
    const file = { ...JSON.parse(songToJson(song)), version: PLUGIN_SONG_FILE_VERSION };
    file.tracks[0].plugin = 'com.example.never-existed';
    const back = songFromJson(JSON.stringify(file));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.song.tracks[0].plugin).toBe('com.example.never-existed');
  });

  it('refuses a misshapen plugin key in words', () => {
    const song = applied('track 1 voice lead');
    const file = { ...JSON.parse(songToJson(song)), version: PLUGIN_SONG_FILE_VERSION };
    file.tracks[0].plugin = 'not an id';
    const back = songFromJson(JSON.stringify(file));
    expect(back.ok).toBe(false);
  });
});
