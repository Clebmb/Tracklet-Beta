import { describe, expect, it, vi } from 'vitest';

import { buildChannelChain, DUCK_ATTACK_S, MIN_DUCK_RELEASE_S, planDuck } from '../audio/chain';
import {
  applyScript,
  clampDuck,
  createSong,
  DEFAULT_DUCK,
  duckGain,
  duckLabel,
  DUCK_SONG_FILE_VERSION,
  DUCK_STEP,
  emptyTrack,
  instrumentCatalog,
  MAX_DUCK,
  MIN_DUCK,
  SCRIPT_KEYWORDS,
  songFromJson,
  songToJson,
  songToScript,
  SONG_FILE_VERSION,
  stepDuck,
  TRACK_DUCK,
} from '../model';
import { scriptCapabilities } from '../model/capabilities';

/**
 * The duck, tested as the promise it is: **a percentage on a channel, and a
 * channel at 0 is not there.**
 *
 * Two halves, and the second is the one that could go wrong quietly. The first
 * is that the control means something at the top — a kick at `100` takes the rest
 * of the mix away for the length of its note — which is arithmetic and can be
 * checked by arithmetic. The second is that at `0` nothing anywhere changes: the
 * engine builds no node, the file writes no key, the script writes no word, and
 * `duckGain(0)` is exactly 1, so a song nobody pumps in plays the sample it always
 * played. That is the whole reason a knob like this is safe to add to songs that
 * were written before it existed.
 */

/** A BaseAudioContext stub: a gain, a merger, and a record of what was asked. */
function stubContext(): { ctx: BaseAudioContext; gains: { value: number }[] } {
  const gains: { value: number }[] = [];
  const node = (): unknown => {
    const gain = {
      value: 0,
      setTargetAtTime: vi.fn(),
      // The duck curve is written straight into the gain, so the stub has to
      // answer to the same method the real `AudioParam` does.
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    };
    gains.push(gain);
    return { gain, connect: vi.fn(() => node()), disconnect: vi.fn() };
  };
  const ctx = {
    currentTime: 0,
    createGain: () => node(),
    createChannelMerger: () => node(),
  } as unknown as BaseAudioContext;
  return { ctx, gains };
}

describe('a duck is a percentage, and both ends are named', () => {
  it('clamps into the range the control offers', () => {
    expect(clampDuck(-20)).toBe(MIN_DUCK);
    expect(clampDuck(140)).toBe(MAX_DUCK);
    expect(clampDuck(40.6)).toBe(41);
  });

  it('treats a value it cannot use as off rather than as a full pump', () => {
    // Off is the safe direction, and the direction every other default in this
    // app points: a broken number must not silently reshape somebody's mix.
    expect(clampDuck(Number.NaN)).toBe(DEFAULT_DUCK);
    expect(clampDuck(Number.POSITIVE_INFINITY)).toBe(MAX_DUCK);
  });

  it('says OFF rather than 0%, and a percentage otherwise', () => {
    expect(duckLabel(MIN_DUCK)).toBe('OFF');
    expect(duckLabel(60)).toBe('60%');
    expect(duckLabel(MAX_DUCK)).toBe('100%');
  });

  it('turns an amount into the gain the others are multiplied by', () => {
    // The one value that matters is the bottom: 0 is EXACTLY 1, which is what
    // makes an unducked song bit-identical to one written before the knob.
    expect(duckGain(MIN_DUCK)).toBe(1);
    expect(duckGain(60)).toBe(0.4);
    expect(duckGain(MAX_DUCK)).toBe(0);
    expect(duckGain(Number.NaN)).toBe(1);
  });

  it('nudges by the same step a level does, without skipping a stop', () => {
    expect(stepDuck(0, 1)).toBe(DUCK_STEP);
    expect(stepDuck(MAX_DUCK, 1)).toBe(MAX_DUCK);
    expect(stepDuck(MAX_DUCK, -1)).toBe(MAX_DUCK - DUCK_STEP);
    expect(stepDuck(0, -1)).toBe(MIN_DUCK);
    // Off a stop, it lands on the next one rather than drifting by one.
    expect(stepDuck(45, 1)).toBe(50);
    expect(stepDuck(45, -1)).toBe(40);
  });

  it('gives a new channel no duck at all', () => {
    const track = emptyTrack(0);
    expect(track.duck).toBe(DEFAULT_DUCK);
    expect(DEFAULT_DUCK).toBe(MIN_DUCK);
  });

  it('describes itself once, so the menus, the catalog and F6 agree', () => {
    expect(TRACK_DUCK.id).toBe('duck');
    expect(TRACK_DUCK.label).toBe('DUCK');
    expect(TRACK_DUCK.low).not.toBe('');
    expect(TRACK_DUCK.high).not.toBe('');
    expect(TRACK_DUCK.blurb).toContain('REST');
    expect(TRACK_DUCK.reach.length).toBeGreaterThan(10);
  });
});

describe('the pump, as a curve on a gain', () => {
  /** A stand-in for a real AudioParam, recording the events a duck writes. */
  function paramSpy(): {
    param: AudioParam;
    setValueAtTime: ReturnType<typeof vi.fn>;
    ramp: ReturnType<typeof vi.fn>;
  } {
    const setValueAtTime = vi.fn();
    const linearRampToValueAtTime = vi.fn();
    return {
      param: { setValueAtTime, linearRampToValueAtTime } as unknown as AudioParam,
      setValueAtTime,
      ramp: linearRampToValueAtTime,
    };
  }

  it('writes nothing at all when the channel does not duck', () => {
    const { param, setValueAtTime, ramp } = paramSpy();
    planDuck(param, MIN_DUCK, 1, 0.5);
    expect(setValueAtTime).not.toHaveBeenCalled();
    expect(ramp).not.toHaveBeenCalled();
  });

  it('writes nothing for an amount it cannot read', () => {
    const { param, setValueAtTime, ramp } = paramSpy();
    planDuck(param, Number.NaN, 1, 0.5);
    expect(setValueAtTime).not.toHaveBeenCalled();
    expect(ramp).not.toHaveBeenCalled();
  });

  it('dips to the amount and comes back over the length of the hit', () => {
    const { param, setValueAtTime, ramp } = paramSpy();
    planDuck(param, 60, 4, 0.25);
    // Where it belongs at the moment of the hit, then the dip, then the way back.
    expect(setValueAtTime).toHaveBeenCalledWith(1, 4);
    expect(ramp).toHaveBeenNthCalledWith(1, 0.4, 4 + DUCK_ATTACK_S);
    expect(ramp).toHaveBeenNthCalledWith(2, 1, 4 + DUCK_ATTACK_S + 0.25);
  });

  it('never releases so fast that it clicks', () => {
    // A one-step kick at a fast tempo is a very short note: the dip must still
    // take long enough to read as a pump rather than as a click.
    const { param, ramp } = paramSpy();
    planDuck(param, 100, 0, 0.001);
    expect(ramp).toHaveBeenNthCalledWith(2, 1, DUCK_ATTACK_S + MIN_DUCK_RELEASE_S);
  });
});

describe('the graph a duck builds', () => {
  const sends = { reverb: {} as AudioNode, echo: {} as AudioNode };

  it('adds nothing to a channel that does not duck', () => {
    const { ctx } = stubContext();
    const plain = buildChannelChain(ctx, { level: 1, pan: 0, verb: 100, echo: 100 }, {} as AudioNode, sends);
    // The graph every song had before this existed: in, out, two pan taps, two
    // send taps and the merger — no dip node to multiply by one forever.
    expect(plain.ducked).toBe(false);
    expect(plain.nodes).toHaveLength(6);
  });

  it('gives every channel a dip when anybody ducks, and only then', () => {
    const { ctx } = stubContext();
    const ducking = buildChannelChain(
      ctx,
      { level: 1, pan: 0, verb: 100, echo: 100, duck: true },
      {} as AudioNode,
      sends,
    );
    expect(ducking.ducked).toBe(true);
    // Eight rather than seven: with a dip in the chain the fader can no longer
    // BE the input, because the dip has to sit in front of it — the fader is
    // what the sends tap, so a duck behind it would leave the tail in the hall.
    expect(ducking.nodes).toHaveLength(8);
    // The channel doing the pushing carries the node too: one flag, both ends, so
    // the graph does not have to be rebuilt the moment somebody starts ducking.
    expect(() => ducking.scheduleDuck(60, 0, 0.2)).not.toThrow();
  });

  it('ignores a scheduled dip when the channel has no dip node', () => {
    const { ctx } = stubContext();
    const plain = buildChannelChain(ctx, { level: 1, pan: 0, verb: 100, echo: 100 }, {} as AudioNode, sends);
    expect(() => plain.scheduleDuck(60, 0, 0.2)).not.toThrow();
  });
});

describe('the word', () => {
  /** A song with four channels, the default, ready for one `track` line. */
  const line = (text: string) => applyScript(createSong(), text);

  it('sets how far a channel pushes the rest down', () => {
    const result = line('track 1 duck 60');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0].duck).toBe(60);
  });

  it('leaves every other channel alone', () => {
    const result = line('track 1 duck 60\ntracks 3');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[1].duck).toBe(DEFAULT_DUCK);
  });

  it('refuses a number it cannot use, and says what a duck does', () => {
    const result = line('track 1 duck 140');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain('duck is a percentage');
    expect(result.errors[0].message).toContain('pushes the other channels');
  });

  it('reads a bare duck as a setting with nothing after it', () => {
    const result = line('track 1 duck');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain('duck needs a percentage');
  });

  it('still lets a channel be CALLED duck, quoted', () => {
    const result = line('track 1 "DUCK" wave sine');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0].name).toBe('DUCK');
    expect(result.song.tracks[0].duck).toBe(DEFAULT_DUCK);
  });

  it('is a setting on a track line, not a command of its own', () => {
    // The language's own rule: prefer a knob to a verb. A duck is a property of a
    // channel, so it is written on the `track` line and is deliberately NOT one
    // of the command words — there is no `duck 60` statement to learn.
    expect(SCRIPT_KEYWORDS).not.toContain('duck');
    expect(line('duck 60').ok).toBe(false);
  });

  it('takes the line `doc/01` tells a beginner to type', () => {
    // The guide's pump section is prose with an unchecked fence around it, so the
    // line it shows is applied here instead: a doc example that does not parse is
    // worse than no example at all.
    const result = line('track 1 "KICK"  duck 70');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.tracks[0].name).toBe('KICK');
    expect(result.song.tracks[0].duck).toBe(70);
  });

  it('writes the word only when the channel actually ducks', () => {
    const quiet = songToScript(createSong());
    expect(quiet).not.toContain('duck');
    const pumped = applyScript(createSong(), 'track 2 duck 70');
    expect(pumped.ok).toBe(true);
    if (!pumped.ok) return;
    const written = songToScript(pumped.song);
    expect(written).toContain('duck 70');
    // And it round trips: reading the script back gives the same number.
    const again = applyScript(createSong(), written);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.song.tracks[1].duck).toBe(70);
  });
});

describe('the file', () => {
  it('declares version 16 when a channel ducks, and 12 when nobody does', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    expect(raw.version).toBe(SONG_FILE_VERSION);
    expect(JSON.stringify(raw)).not.toContain('duck');

    const pumped = applyScript(createSong(), 'track 1 duck 60');
    expect(pumped.ok).toBe(true);
    if (!pumped.ok) return;
    const file = songToJson(pumped.song);
    expect(file).toContain(`"version": ${DUCK_SONG_FILE_VERSION}`);
    expect(file).toContain('"duck": 60');
  });

  it('reads a duck back byte for byte', () => {
    const pumped = applyScript(createSong(), 'track 1 duck 60');
    expect(pumped.ok).toBe(true);
    if (!pumped.ok) return;
    const file = songToJson(pumped.song);
    const back = songFromJson(file);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.tracks[0].duck).toBe(60);
    expect(songToJson(back.song)).toBe(file);
  });

  it('opens a file written before ducks existed as a still mix', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const older = songFromJson(JSON.stringify(raw));
    expect(older.ok).toBe(true);
    if (!older.ok) return;
    for (const track of older.song.tracks) expect(track.duck).toBe(DEFAULT_DUCK);
  });

  it('clamps a duck it cannot use and refuses one that is not a number', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const loud = songFromJson(JSON.stringify({ ...raw, version: DUCK_SONG_FILE_VERSION, tracks: withDuck(raw, 400) }));
    expect(loud.ok).toBe(true);
    if (!loud.ok) return;
    expect(loud.song.tracks[0].duck).toBe(MAX_DUCK);

    const nonsense = songFromJson(JSON.stringify({ ...raw, version: DUCK_SONG_FILE_VERSION, tracks: withDuck(raw, 'hard') }));
    expect(nonsense.ok).toBe(false);
    if (nonsense.ok) return;
    expect(nonsense.errors.join(' ')).toContain('"duck"');
  });

  /** The file's own channels with the first one's duck replaced. */
  function withDuck(raw: Record<string, unknown>, duck: unknown): unknown[] {
    const tracks = (raw.tracks as Record<string, unknown>[]).map((track) => ({ ...track }));
    tracks[0].duck = duck;
    return tracks;
  }
});

describe('what the build says about it', () => {
  it('publishes the range, so a tool does not have to guess it', () => {
    const { limits, versionNotes, scriptVersion } = scriptCapabilities();
    expect(limits.duck.min).toBe(MIN_DUCK);
    expect(limits.duck.max).toBe(MAX_DUCK);
    expect(versionNotes.some((note) => note.version === 5 && note.note.includes('duck'))).toBe(true);
    expect(scriptVersion).toBeGreaterThanOrEqual(5);
  });

  it('puts it in the catalog the F6 browser reads', () => {
    const { duck } = instrumentCatalog();
    expect(duck.label).toBe(TRACK_DUCK.label);
    expect(duck.min).toBe(MIN_DUCK);
    expect(duck.max).toBe(MAX_DUCK);
    expect(duck.step).toBe(DUCK_STEP);
    expect(duck.atDefault).toBe(DEFAULT_DUCK);
    expect(duck.script).toBe('track 1 duck 60');
  });
});
