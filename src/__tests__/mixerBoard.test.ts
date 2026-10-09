import { describe, expect, it } from 'vitest';

import { MAX_BUSES, NO_BUS_WORD, type Bus } from '../model/bus';
import { createMachine } from '../model/machine';
import {
  createSong,
  MAX_LEVEL,
  MAX_PAN,
  MAX_SEND,
  NO_EFFECTS,
  TRACK_EFFECTS,
  type Track,
} from '../model/song';
import {
  beginGesture,
  busChoices,
  busIn,
  channelColumn,
  channelColumns,
  channelCount,
  channelLabel,
  clampChannel,
  clampPage,
  EFFECTS_PER_PAGE,
  effectPages,
  isMachineChannel,
  MACHINE_CHANNEL,
  MIX_GESTURE_MS,
  MIX_NUMBER_FIELDS,
  MIX_ROWS,
  mixStep,
  sameScene,
  sceneTargets,
  moveChannel,
  newBusName,
  NO_GESTURE,
  snapshotMachineMix,
  snapshotTrackMix,
  nextBusChoice,
  nextPage,
  type MixScene,
} from '../ui/mixerBoard';

/**
 * The MIXER page's decisions — the half of the page a headless runner can check.
 *
 * The page itself is pixels, but a mixer is mostly arithmetic: which strips
 * exist, where the selection can go, which group a channel may join and how the
 * effects are paged. Each of those is easy to get subtly wrong in a way a
 * screenshot would not show — a selection pointing at a strip nobody drew, a
 * group choice naming a bus the model would refuse, an effect list a page short —
 * so each is pinned here the way `drumGrid.test.ts` pins the drum machine's grid.
 */

const bus = (name: string, level = 70): Bus => ({ name, level });

/** A real default channel, with whatever a case wants changed about it. */
const track = (over: Partial<Track> = {}): Track => ({ ...createSong().tracks[0]!, ...over });

describe('which strips the page draws', () => {
  it('is one per channel, plus the machine only when the song has one', () => {
    expect(channelCount(4, false)).toBe(4);
    expect(channelCount(4, true)).toBe(5);
    expect(channelCount(0, false)).toBe(0);
    expect(channelCount(0, true)).toBe(1);
  });

  it('never draws a negative or fractional number of strips', () => {
    expect(channelCount(-3, false)).toBe(0);
    expect(channelCount(2.6, false)).toBe(3);
  });
});

describe('the machine is a column of the mix without being a channel', () => {
  it('is the one index no channel number can collide with', () => {
    expect(isMachineChannel(MACHINE_CHANNEL)).toBe(true);
    expect(isMachineChannel(0)).toBe(false);
    expect(isMachineChannel(7)).toBe(false);
  });

  it('labels the machine column MACHINE and a channel by its own name', () => {
    expect(channelLabel(MACHINE_CHANNEL, 'KICK')).toBe('MACHINE');
    expect(channelLabel(2, 'BASS')).toBe('BASS');
  });
});

describe('where the selection can be', () => {
  it('clamps a channel into the strips that exist', () => {
    expect(clampChannel(0, 4, false)).toBe(0);
    expect(clampChannel(3, 4, false)).toBe(3);
    expect(clampChannel(9, 4, false)).toBe(3);
    expect(clampChannel(-5, 4, false)).toBe(0);
  });

  it('lands a past-the-end selection on the machine when there is one', () => {
    expect(clampChannel(9, 4, true)).toBe(MACHINE_CHANNEL);
    expect(clampChannel(4, 4, true)).toBe(MACHINE_CHANNEL);
  });

  it('repairs a machine selection when the song has no machine', () => {
    expect(clampChannel(MACHINE_CHANNEL, 4, false)).toBe(3);
  });

  it('has a single answer for a song with no strips at all', () => {
    expect(clampChannel(5, 0, false)).toBe(0);
    expect(clampChannel(MACHINE_CHANNEL, 0, false)).toBe(0);
  });

  it('walks the row and stops at both walls', () => {
    expect(moveChannel(0, 1, 4, false)).toBe(1);
    expect(moveChannel(0, -1, 4, false)).toBe(0);
    expect(moveChannel(3, 1, 4, false)).toBe(3);
    // The machine is simply the last column of the row.
    expect(moveChannel(3, 1, 4, true)).toBe(MACHINE_CHANNEL);
    expect(moveChannel(MACHINE_CHANNEL, 1, 4, true)).toBe(MACHINE_CHANNEL);
    expect(moveChannel(MACHINE_CHANNEL, -1, 4, true)).toBe(3);
  });

  it('flattens a selection into a column, machine last', () => {
    expect(channelColumn(2, 4, false)).toBe(2);
    expect(channelColumn(MACHINE_CHANNEL, 4, true)).toBe(4);
    expect(channelColumn(0, 0, false)).toBe(0);
  });

  it('lists every column in screen order, machine last', () => {
    expect(channelColumns(3, false)).toEqual([0, 1, 2]);
    expect(channelColumns(3, true)).toEqual([0, 1, 2, MACHINE_CHANNEL]);
    expect(channelColumns(0, false)).toEqual([]);
  });
});

describe('the groups a channel may join', () => {
  it('offers NONE first, then the song’s own groups in order', () => {
    expect(busChoices([])).toEqual([{ label: 'NONE', name: null }]);
    expect(busChoices([bus('DRUMS'), bus('KEYS')])).toEqual([
      { label: 'NONE', name: null },
      { label: 'DRUMS', name: 'DRUMS' },
      { label: 'KEYS', name: 'KEYS' },
    ]);
  });

  it('cycles forward and backward, wrapping at both ends', () => {
    const buses = [bus('DRUMS'), bus('KEYS')];
    expect(nextBusChoice(buses, null).name).toBe('DRUMS');
    expect(nextBusChoice(buses, 'DRUMS').name).toBe('KEYS');
    expect(nextBusChoice(buses, 'KEYS').name).toBe(null);
    expect(nextBusChoice(buses, null, -1).name).toBe('KEYS');
  });

  it('lands on NONE when the channel names a group the song does not have', () => {
    expect(nextBusChoice([], 'DRUMS').name).toBe(null);
  });

  it('matches a name however it was typed', () => {
    expect(nextBusChoice([bus('DRUMS')], 'drums').name).toBe(null);
  });
});

describe('how the effects are paged', () => {
  it('shows every effect the model has, once, in the model’s own order', () => {
    const flat = effectPages().flat();
    expect(flat).toEqual(TRACK_EFFECTS.map((effect) => effect.id));
    expect(new Set(flat).size).toBe(flat.length);
  });

  it('never shows more than a page’s worth', () => {
    for (const page of effectPages()) {
      expect(page.length).toBeLessThanOrEqual(EFFECTS_PER_PAGE);
    }
    // And derives the page count rather than listing it: one page per chunk.
    expect(effectPages().length).toBe(Math.ceil(TRACK_EFFECTS.length / EFFECTS_PER_PAGE));
  });

  it('clamps a page into the pages that exist and never goes below zero', () => {
    expect(clampPage(-1, 2)).toBe(0);
    expect(clampPage(1, 2)).toBe(1);
    expect(clampPage(9, 2)).toBe(1);
    expect(clampPage(0, 0)).toBe(0);
  });

  it('turns a page round to the next, and stays put when there is one', () => {
    expect(nextPage(0, 2)).toBe(1);
    expect(nextPage(1, 2)).toBe(0);
    expect(nextPage(0, 1)).toBe(0);
    expect(nextPage(0, 0)).toBe(0);
  });
});

describe('the name a new group gets', () => {
  it('is a fresh GROUPn, never one the song already uses', () => {
    expect(newBusName([])).toBe('GROUP1');
    expect(newBusName([bus('GROUP1')])).toBe('GROUP2');
    expect(newBusName([bus('GROUP1'), bus('GROUP2')])).toBe('GROUP3');
  });

  it('never redefines an existing group, whatever it is called', () => {
    // A group called GROUP2 still leaves GROUP1 free for the next press.
    expect(newBusName([bus('GROUP2')])).toBe('GROUP1');
  });

  it('refuses to invent a fifth group', () => {
    const full = Array.from({ length: MAX_BUSES }, (_, i) => bus(`GROUP${i + 1}`));
    expect(newBusName(full)).toBe(null);
  });

  it('generates a name the model would accept', () => {
    const name = newBusName([]);
    expect(name).not.toBe(null);
    expect(name).not.toBe(NO_BUS_WORD.toUpperCase());
  });
});

describe("copying a channel's mix", () => {

  it('carries every control the panel draws, and nothing the panel does not', () => {
    const mix = snapshotTrackMix(track({ level: 80, pan: -30, verb: 20, echo: 5, duck: 40, bus: 'DRUMS' }));
    expect(mix.level).toBe(80);
    expect(mix.pan).toBe(-30);
    expect(mix.verb).toBe(20);
    expect(mix.echo).toBe(5);
    expect(mix.duck).toBe(40);
    expect(mix.bus).toBe('DRUMS');
    // The five numbers are exactly `MIX_NUMBER_FIELDS`, so a snapshot cannot
    // quietly lose a row the panel draws.
    expect(MIX_NUMBER_FIELDS.every((field) => typeof mix[field] === 'number')).toBe(true);
    expect(MIX_ROWS).toEqual([...MIX_NUMBER_FIELDS, 'bus']);
  });

  it('carries every effect the model has, one each', () => {
    const source = track();
    source.drive = 40;
    source.gate = 15;
    const mix = snapshotTrackMix(source);
    expect(Object.keys(mix.effects).sort()).toEqual(TRACK_EFFECTS.map((e) => e.id).sort());
    expect(mix.effects.drive).toBe(40);
    expect(mix.effects.gate).toBe(15);
    // And the rest are OFF rather than undefined: a paste writes all ten, so a
    // missing key would write `undefined` onto the target.
    expect(Object.values(mix.effects).every((v) => typeof v === 'number')).toBe(true);
  });

  it('clamps what it carries, because the clipboard outlives the song', () => {
    const mix = snapshotTrackMix(track({ level: 500, pan: -900, verb: 300, echo: -20, duck: 900 }));
    expect(mix.level).toBe(MAX_LEVEL);
    expect(mix.pan).toBe(-MAX_PAN);
    expect(mix.verb).toBe(MAX_SEND);
    expect(mix.echo).toBe(0);
  });

  it('answers in the same shape for the machine, which keeps its effects in a bag', () => {
    const machine = createMachine();
    machine.level = 60;
    machine.pan = 25;
    machine.verb = 30;
    machine.effects.tape = 45;
    const mix = snapshotMachineMix(machine);
    expect(mix.level).toBe(60);
    expect(mix.pan).toBe(25);
    expect(mix.effects.tape).toBe(45);
    // The two kinds of column answer to ONE shape, which is what makes a copy
    // from a channel onto the machine (and back) a single code path.
    expect(Object.keys(mix).sort()).toEqual(Object.keys(snapshotTrackMix(track())).sort());
  });

  it('lands on no group when the song does not have the one that was copied', () => {
    const mix = snapshotTrackMix(track({ bus: 'KEYS' }));
    expect(busIn(mix, [bus('DRUMS')])).toBe(null);
    expect(busIn(mix, [bus('DRUMS'), bus('KEYS')])).toBe('KEYS');
    // A channel that was on no group stays on none, which is not a repair.
    expect(busIn(snapshotTrackMix(track({ bus: null })), [bus('DRUMS')])).toBe(null);
  });
});

describe('A/B, two balances of one song', () => {
  const scene = (tracks: number, machine = false, level = 70): MixScene => ({
    tracks: Array.from({ length: tracks }, () => snapshotTrackMix(track({ level }))),
    machine: machine ? snapshotMachineMix(createMachine()) : null,
    buses: [bus('DRUMS', 90)],
    room: { reverb: 30, echo: 10 },
    master: { ...NO_EFFECTS },
  });

  it('lands every column a song of the same size has', () => {
    const targets = sceneTargets(scene(4), 4, false);
    expect(targets.tracks.map((t) => t.index)).toEqual([0, 1, 2, 3]);
    expect(targets.droppedTracks).toBe(0);
    expect(targets.droppedMachine).toBe(false);
  });

  it('writes only the channels this song has, and reports the rest', () => {
    // A balance taken from an eight-channel song, switched into a four-channel
    // one: four channels move and the other four are SAID rather than invented.
    const targets = sceneTargets(scene(8), 4, false);
    expect(targets.tracks.map((t) => t.index)).toEqual([0, 1, 2, 3]);
    expect(targets.droppedTracks).toBe(4);
  });

  it('moves channels but never invents one for a song that has more', () => {
    const targets = sceneTargets(scene(2), 6, false);
    expect(targets.tracks.map((t) => t.index)).toEqual([0, 1]);
    expect(targets.droppedTracks).toBe(0);
  });

  it('puts the machine on the machine, and nowhere when there is none', () => {
    expect(sceneTargets(scene(3, true), 3, true).machine).not.toBe(null);
    const noMachine = sceneTargets(scene(3, true), 3, false);
    expect(noMachine.machine).toBe(null);
    expect(noMachine.droppedMachine).toBe(true);
  });

  it('knows when the two sides hold the same numbers', () => {
    expect(sameScene(scene(4), scene(4))).toBe(true);
    expect(sameScene(scene(4), scene(4, false, 71))).toBe(false);
    expect(sameScene(scene(4, true), scene(4, false))).toBe(false);
    expect(sameScene(scene(4), scene(5))).toBe(false);
    const edited = scene(4);
    edited.room.reverb = 31;
    expect(sameScene(scene(4), edited)).toBe(false);
    edited.master.drive = 20;
    expect(sameScene(scene(4), edited)).toBe(false);
  });

  it('carries the parts that are not a column at all', () => {
    const balance = scene(2);
    expect(balance.buses).toEqual([{ name: 'DRUMS', level: 90 }]);
    expect(balance.room).toEqual({ reverb: 30, echo: 10 });
    // The whole mix is part of a balance: comparing two mixes that shared a tape
    // would be comparing two different tapes.
    expect(Object.keys(balance.master).length).toBe(TRACK_EFFECTS.length);
  });
});

describe('the undo bargain', () => {
  it('banks a step for the first change of a gesture', () => {
    const step = mixStep(NO_GESTURE, true, 1000);
    expect(step.record).toBe(true);
    expect(step.gesture.recorded).toBe(true);
    expect(step.gesture.at).toBe(1000);
  });

  it('folds the rest of the run into that one step', () => {
    // This is the whole point: a held `-` or a drag is one Ctrl+Z.
    const first = mixStep(NO_GESTURE, true, 1000);
    const second = mixStep(first.gesture, true, 1016);
    const third = mixStep(second.gesture, true, 3000 - MIX_GESTURE_MS + 1);
    expect([second.record, third.record]).toEqual([false, false]);
    expect(third.gesture.recorded).toBe(true);
    // And the window slides, so a long hold is one step all the way down.
    expect(third.gesture.at).toBe(3000 - MIX_GESTURE_MS + 1);
  });

  it('opens a new step once the run has gone quiet', () => {
    const first = mixStep(NO_GESTURE, true, 1000);
    const late = mixStep(first.gesture, true, 1000 + MIX_GESTURE_MS);
    expect(late.record).toBe(true);
  });

  it('opens a new step for a fresh press, however soon it lands', () => {
    // `beginGesture` is what a key press and a click do: two deliberate acts are
    // two steps even a millisecond apart.
    const first = mixStep(NO_GESTURE, true, 1000);
    const pressed = mixStep(beginGesture(), true, 1001);
    expect(first.record).toBe(true);
    expect(pressed.record).toBe(true);
  });

  it('never folds for the page that does not ask it to', () => {
    // The drum machine page keeps its per-change step, and — the part that
    // matters — leaves no gesture behind, so the two screens cannot spend each
    // other's run.
    const noGesture = mixStep(NO_GESTURE, false, 1000);
    const next = mixStep(NO_GESTURE, false, 1001);
    expect([noGesture.record, next.record]).toEqual([true, true]);
    expect(noGesture.gesture).toEqual(NO_GESTURE);
  });
});
