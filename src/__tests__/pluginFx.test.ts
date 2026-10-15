import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  emptyTrack,
  FX_SONG_FILE_VERSION,
  MAX_TRACK_FX,
  removeTrackFx,
  setTrackFx,
  SONG_FILE_VERSION,
  songFromJson,
  songToJson,
  songToScript,
} from '../model';
import { AudioEngine } from '../audio/engine';
import { applyTrackFx, resolveTrackFx } from '../audio/pluginFx';
import { BUILT_IN_EFFECTS } from '../plugins/builtIn';
import { effectMix } from '../plugins/effect';
import { seatEffectModule } from '../plugins/loader';
import { defineEffect } from '../plugins/sdk';
import bitcrushManifest from '../../examples/plugins/bitcrush-plus/manifest.json';
import { processBlock as processBitcrush } from '../../examples/plugins/bitcrush-plus/index';
import { renderNote as renderSupersaw } from '../../examples/plugins/supersaw/index';
import supersawManifest from '../../examples/plugins/supersaw/manifest.json';

/** Apply a fragment, throwing the refusal's own message on failure. */
function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' / '));
  return result.song;
}

/** Refuse a fragment, returning the messages. */
function refusal(source: string): string {
  const result = applyScript(createSong(), source);
  expect(result.ok).toBe(false);
  if (result.ok) return '';
  return result.errors.map((e) => e.message).join(' / ');
}

describe('the fx chain on channels', () => {
  it('starts empty: a fresh channel seats no effect', () => {
    expect(emptyTrack(0).fx).toEqual([]);
  });

  it('seats an effect and retunes the slot that already names it', () => {
    const track = emptyTrack(0);
    setTrackFx(track, 'com.example.bitcrush-plus', 45);
    setTrackFx(track, 'com.example.bitcrush-plus', 60);
    expect(track.fx).toEqual([{ id: 'com.example.bitcrush-plus', amount: 60 }]);
  });

  it('caps the chain at four: a fifth id is refused by the language, not dropped', () => {
    const track = emptyTrack(0);
    for (let i = 0; i < MAX_TRACK_FX; i++) setTrackFx(track, `com.example.fx-${i}`, 50);
    expect(track.fx).toHaveLength(MAX_TRACK_FX);
    expect(refusal('fx 1 com.example.fx-a 10\nfx 1 com.example.fx-b 10\nfx 1 com.example.fx-c 10\nfx 1 com.example.fx-d 10\nfx 1 com.example.fx-e 10')).toContain('already seats 4');
  });

  it('takes one slot — or the chain — off', () => {
    const track = emptyTrack(0);
    setTrackFx(track, 'com.example.bitcrush-plus', 45);
    removeTrackFx(track, 'com.example.bitcrush-plus');
    expect(track.fx).toEqual([]);
    const cleared = applied('fx 1 com.example.bitcrush-plus 45\nfx 1 clear');
    expect(cleared.tracks[0].fx).toEqual([]);
  });
});

describe('the fx statement', () => {
  it('seats an effect on a channel, in chain order', () => {
    const song = applied('fx 1 com.example.bitcrush-plus 45');
    expect(song.tracks[0].fx).toEqual([{ id: 'com.example.bitcrush-plus', amount: 45 }]);
  });

  it('keeps an unknown id: fallback is the engine\u2019s business', () => {
    const song = applied('fx 2 com.example.never-existed 30');
    expect(song.tracks[1].fx).toEqual([{ id: 'com.example.never-existed', amount: 30 }]);
  });

  it('refuses a channel it does not have, an amount it cannot play, and a fifth seat', () => {
    expect(refusal('fx 9 com.example.bitcrush-plus 45')).toContain('Channels are 1..4');
    expect(refusal('fx 1 com.example.bitcrush-plus 140')).toContain('0..100');
    expect(refusal('fx 1 com.example.bitcrush-plus')).toContain('seats an effect');
  });

  it('writes what it reads: SAVE AS SCRIPT round-trips the chain', () => {
    const song = applied('fx 1 com.example.bitcrush-plus 45\nfx 1 com.example.never-existed 30\npattern 1 "A"\nC-4');
    const text = songToScript(song);
    expect(text).toContain('fx 1 com.example.bitcrush-plus 45');
    expect(text).toContain('fx 1 com.example.never-existed 30');
    expect(applied(text).tracks[0].fx).toEqual(song.tracks[0].fx);
  });
});

describe('seated effects in song files', () => {
  it('writes version 44 only when a channel seats one', () => {
    const plain = applied('track 1 voice lead');
    expect(JSON.parse(songToJson(plain)).version).toBe(SONG_FILE_VERSION);
    const fxed = applied('fx 1 com.example.bitcrush-plus 45');
    expect(JSON.parse(songToJson(fxed)).version).toBe(FX_SONG_FILE_VERSION);
  });

  it('round-trips the chain through JSON', () => {
    const song = applied('fx 3 com.example.bitcrush-plus 45');
    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.song.tracks[2].fx).toEqual([{ id: 'com.example.bitcrush-plus', amount: 45 }]);
  });

  it('reads a file that seats nothing as a dry chain', () => {
    const back = songFromJson(songToJson(createSong()));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.song.tracks[0].fx).toEqual([]);
  });

  it('refuses a malformed slot in words', () => {
    const song = applied('track 1 voice lead');
    const file = JSON.parse(songToJson(song)) as { tracks: { fx?: unknown }[]; version: number };
    file.version = FX_SONG_FILE_VERSION;
    file.tracks[0].fx = [{ id: 'com.example.bitcrush-plus' }];
    expect(songFromJson(JSON.stringify(file)).ok).toBe(false);
  });
});

describe('the effect trust gate', () => {
  it('seats the proof effect and refuses an instrument at the effect door', () => {
    const seated = seatEffectModule(bitcrushManifest, { processBlock: processBitcrush });
    expect(seated.ok).toBe(true);
    const wrongKind = defineEffect({ manifest: supersawManifest, processBlock: processBitcrush });
    expect(wrongKind.ok).toBe(false);
    if (!wrongKind.ok) expect(wrongKind.error).toContain('not an effect');
    const silent = seatEffectModule(bitcrushManifest, { renderNote: renderSupersaw });
    expect(silent.ok).toBe(false);
  });
});

describe('the insert chain on samples', () => {
  const dry = new Float32Array([0.5, -0.5, 0.25, -0.25]);

  it('plays dry at 0, wet at 100, and between in the middle', () => {
    const [proof] = BUILT_IN_EFFECTS;
    if (!proof) throw new Error('the app carries no proof effect');
    const chain = resolveTrackFx([[{ id: proof.manifest.id, amount: 0 }]], BUILT_IN_EFFECTS);
    expect(Array.from(applyTrackFx(dry, chain[0] ?? [], 22050))).toEqual(Array.from(dry));
    const wet = resolveTrackFx([[{ id: proof.manifest.id, amount: 100 }]], BUILT_IN_EFFECTS);
    expect(Array.from(applyTrackFx(dry, wet[0] ?? [], 22050))).toEqual(
      Array.from(proof.processBlock(dry, {}, 22050)),
    );
    const half = applyTrackFx(dry, resolveTrackFx([[{ id: proof.manifest.id, amount: 50 }]], BUILT_IN_EFFECTS)[0] ?? [], 22050);
    expect(Array.from(half)).toEqual(Array.from(effectMix(50, dry, proof.processBlock(dry, {}, 22050))));
  });

  it('plays dry for a name the library does not hold', () => {
    const chain = resolveTrackFx([[{ id: 'com.example.never-existed', amount: 100 }]], BUILT_IN_EFFECTS);
    expect(chain[0]).toEqual([]);
    expect(Array.from(applyTrackFx(dry, chain[0] ?? [], 22050))).toEqual(Array.from(dry));
  });

  it('banks one chain per channel on the engine', () => {
    const engine = new AudioEngine({ trackCount: 2 });
    engine.setPluginFx([[{ id: 'com.example.bitcrush-plus', amount: 45 }], []], BUILT_IN_EFFECTS);
    expect(engine.pluginFxBank[0]?.map((slot) => slot.plugin.manifest.id)).toEqual(['com.example.bitcrush-plus']);
    expect(engine.pluginFxBank[0]?.map((slot) => slot.amount)).toEqual([45]);
    expect(engine.pluginFxBank[1]).toEqual([]);
  });
});
