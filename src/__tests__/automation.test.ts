import { describe, expect, it } from 'vitest';

import {
  applyScript,
  AUTOMATION_SONG_FILE_VERSION,
  AUTOMATION_TARGET_BY_ID,
  AUTOMATION_TARGETS,
  AUTOMATION_TARGET_WORDS,
  automatedGate,
  automatedLevel,
  automatedValue,
  automatedVoice,
  automatesVoice,
  clampAutomationBar,
  clampAutomationTrack,
  clampAutomationValue,
  createSong,
  DEFAULT_VOICE,
  isAutomationTarget,
  laneLabel,
  laneScript,
  lanesFor,
  lanesToScript,
  laneValueAt,
  MAX_AUTOMATION_LANES,
  MAX_ORDER,
  patternRows,
  sameLane,
  SCRIPT_KEYWORDS,
  songFromJson,
  songToJson,
  songToScript,
  SONG_FILE_VERSION,
  sortAutomationLanes,
  tidyLane,
  VOICE_PARAMS,
  withAutomationLane,
  withoutAutomationLane,
  type AutomationLane,
} from '../model';
import { scriptCapabilities } from '../model/capabilities';

/**
 * Lanes, tested as the promise they are: **a value that moves over bars, and a
 * song with no lanes plays exactly as it always did.**
 *
 * The first half is arithmetic and can be checked by arithmetic: where a lane
 * starts, how it walks, that it HOLDS the value it arrived at, and that two lanes
 * on one channel compose in the order they were written. The second half is the
 * one that could go wrong quietly: with no lanes at all, `automated*` returns
 * `null` rather than a number, the file writes no key, the script writes no word,
 * and the engine builds nothing. That is the whole reason a lane is safe to add
 * to a song written before lanes existed.
 */

/** A lane, with the fields a test does not care about filled in. */
function lane(over: Partial<AutomationLane> = {}): AutomationLane {
  return { track: 1, target: 'bright', from: 0, to: 100, startBar: 1, endBar: 1, ...over };
}

describe('a lane is a value that moves, and every target is named', () => {
  it('moves the nine knobs, the level, the gate and the drift — and nothing else', () => {
    const ids = AUTOMATION_TARGETS.map((target) => target.id);
    expect(ids).toEqual([...VOICE_PARAMS.map((param) => param.id), 'level', 'gate', 'drift']);
    expect(AUTOMATION_TARGET_WORDS).toEqual(ids);
    expect(isAutomationTarget('bright')).toBe(true);
    expect(isAutomationTarget('level')).toBe(true);
    expect(isAutomationTarget('drift')).toBe(true);
    // The three kinds a lane does NOT move, each for its own reason: a node that
    // is built only when its amount is above zero cannot be faded in from zero.
    expect(isAutomationTarget('drive')).toBe(false);
    expect(isAutomationTarget('pan')).toBe(false);
    expect(isAutomationTarget('verb')).toBe(false);
  });

  it('says where each value lands, which is what the refusal is built from', () => {
    for (const target of AUTOMATION_TARGETS) {
      if (target.id === 'level' || target.id === 'drift') expect(target.scope).toBe('channel');
      else if (target.id === 'gate') expect(target.scope).toBe('note');
      else expect(target.scope).toBe('voice');
    }
  });

  it('borrows the knob table rather than describing a knob twice', () => {
    // The label, both named ends and the blurb come from `VOICE_PARAMS`, so a lane
    // cannot describe `bright` differently from the F4 menu that shows it.
    for (const param of VOICE_PARAMS) {
      const target = AUTOMATION_TARGET_BY_ID[param.id];
      expect(target.label).toBe(param.label);
      expect(target.low).toBe(param.low);
      expect(target.high).toBe(param.high);
      expect(target.blurb).toBe(param.blurb);
    }
  });

  it('gives every target a musical purpose, because that is the hard question', () => {
    for (const target of AUTOMATION_TARGETS) {
      expect(target.reach.length).toBeGreaterThan(20);
    }
  });

  it('clamps a value into the range its own target offers', () => {
    expect(clampAutomationValue('bright', -20)).toBe(0);
    expect(clampAutomationValue('bright', 140)).toBe(100);
    expect(clampAutomationValue('level', 40.6)).toBe(41);
    expect(clampAutomationValue('gate', 40.4)).toBe(40);
    // A value it cannot read goes to the safe end of its own range rather than
    // reshaping a song: off is the direction every default here points.
    expect(clampAutomationValue('gate', Number.NaN)).toBe(0);
    expect(clampAutomationValue('level', Number.NaN)).toBe(0);
    expect(clampAutomationValue('bright', Number.NaN)).toBe(0);
    expect(clampAutomationValue('bright', Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('clamps a channel and a bar into the ranges a song has', () => {
    expect(clampAutomationTrack(0, 4)).toBe(1);
    expect(clampAutomationTrack(9, 4)).toBe(4);
    expect(clampAutomationTrack(Number.NaN, 4)).toBe(1);
    expect(clampAutomationBar(0)).toBe(1);
    expect(clampAutomationBar(999)).toBe(MAX_ORDER);
  });

  it('tidies a lane it was handed, in every field at once', () => {
    const tidied = tidyLane({
      track: 9, target: 'bright', from: -5, to: 400, startBar: 0, endBar: 0,
    });
    // The channel is clamped against the ceiling a SONG has (64), not against the
    // channels of any one song — a lane tidied on its own does not know how many
    // channels it is meant for, so the parser and the file reader name that.
    expect(tidied).toEqual({ track: 9, target: 'bright', from: 0, to: 100, startBar: 1, endBar: 1 });
    expect(tidyLane({ ...tidied, track: 999 }).track).toBe(MAX_ORDER);
  });

  it('keeps a lane whose channel was clamped from ending before it starts', () => {
    // The one ordering rule that has to survive tidying, because a backwards lane
    // is a refusal in the language and a null-frame in the graph.
    const tidied = tidyLane(lane({ startBar: 8, endBar: 3 }));
    expect(tidied.startBar).toBe(8);
    expect(tidied.endBar).toBe(8);
  });
});

describe('the list of lanes', () => {
  it('reads in bar order, and keeps the order lanes were written in', () => {
    const later = lane({ startBar: 8, endBar: 15 });
    const earlier = lane({ startBar: 2, endBar: 4 });
    // Stable, because list order is what decides which lane wins where two
    // overlap — a rise and a fall are exactly two lanes crossing in a song.
    const rise = lane({ startBar: 4, endBar: 8, from: 0, to: 100 });
    const fall = lane({ startBar: 6, endBar: 10, from: 80, to: 20 });
    expect(sortAutomationLanes([later, earlier])).toEqual([earlier, later]);
    expect(sortAutomationLanes([rise, fall])).toEqual([rise, fall]);
  });

  it('adds a lane in reading order', () => {
    const lanes = withAutomationLane([lane({ startBar: 8, endBar: 15 })], lane({ startBar: 2, endBar: 4 }));
    expect(lanes.map((one) => one.startBar)).toEqual([2, 8]);
  });

  it('keeps a lane that would exceed the ceiling out rather than dropping a written one', () => {
    let lanes: AutomationLane[] = [];
    for (let i = 0; i < MAX_AUTOMATION_LANES + 4; i++) {
      lanes = withAutomationLane(lanes, lane({ startBar: (i % 8) + 1, endBar: (i % 8) + 1 }));
    }
    expect(lanes).toHaveLength(MAX_AUTOMATION_LANES);
  });

  it('drops the lane a menu points at', () => {
    const lanes = [lane({ startBar: 1, endBar: 2 }), lane({ startBar: 5, endBar: 8 })];
    expect(withoutAutomationLane(lanes, 0)).toEqual([lanes[1]]);
  });

  it('finds the lanes that move one channel and one thing', () => {
    const lanes = [
      lane({ track: 1, target: 'bright' }),
      lane({ track: 2, target: 'bright' }),
      lane({ track: 1, target: 'level' }),
    ];
    expect(lanesFor(lanes, 1, 'bright')).toEqual([lanes[0]]);
    expect(lanesFor(lanes, 3, 'bright')).toEqual([]);
  });

  it('compares two lanes by what they say, not by identity', () => {
    expect(sameLane(lane(), lane())).toBe(true);
    expect(sameLane(lane(), lane({ to: 90 }))).toBe(false);
  });
});

describe('what a lane says at a step', () => {
  const perBar = 4;
  /** `bright` on channel 1, from 0 at bar 2 to 100 at bar 4, four steps a bar. */
  const walk = lane({ from: 0, to: 100, startBar: 2, endBar: 4 });

  it('says nothing before its first bar', () => {
    expect(laneValueAt(walk, 0, perBar)).toBeNull();
    expect(laneValueAt(walk, 3, perBar)).toBeNull();
  });

  it('plays its first step at `from` and its last at `to`', () => {
    // Bars 2..4 is twelve steps, so the walk is steps 4..15 with step 15 arriving.
    expect(laneValueAt(walk, 4, perBar)).toBe(0);
    expect(laneValueAt(walk, 15, perBar)).toBe(100);
  });

  it('walks straight between them', () => {
    const middle = laneValueAt(walk, 10, perBar)!;
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(100);
    // Two steps apart is the same distance apart as the two around them.
    const a = laneValueAt(walk, 9, perBar)!;
    const b = laneValueAt(walk, 10, perBar)!;
    const c = laneValueAt(walk, 11, perBar)!;
    // Even to within the rounding a whole number forces: eleven steps of a hundred.
    expect(Math.abs((b - a) - (c - b))).toBeLessThanOrEqual(1);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('HOLDS the value it arrived at, which is what makes a lane useful', () => {
    // The rule that turns `bright 15 95 bars 8 to 15` into a drop at bar 16 rather
    // than a snap back, and a fade to silence into a fade that stays faded.
    for (const step of [16, 24, 400]) expect(laneValueAt(walk, step, perBar)).toBe(100);
  });

  it('is a SET rather than a walk when there is nowhere to walk', () => {
    const one = lane({ from: 30, to: 80, startBar: 5, endBar: 5 });
    expect(laneValueAt(one, 4, 1)).toBe(80);
    expect(laneValueAt(one, 40, 1)).toBe(80);
  });

  it('lets the later lane win where two of them overlap', () => {
    const rise = lane({ startBar: 1, endBar: 4, from: 0, to: 100 });
    const fall = lane({ startBar: 3, endBar: 6, from: 100, to: 0 });
    const lanes = sortAutomationLanes([rise, fall]);
    expect(automatedValue(lanes, 1, 'bright', 0, perBar)).toBe(0);
    // Bars 1..4 is sixteen steps, so step 4 is a quarter of the way up: 27.
    expect(automatedValue(lanes, 1, 'bright', 4, perBar)).toBe(27);
    // Step 9 is where the fall has started and is now the last lane in force, so
    // it wins with its own reading rather than the rise's 60.
    expect(automatedValue(lanes, 1, 'bright', 9, perBar)).toBe(93);
    expect(automatedValue(lanes, 1, 'bright', 100, perBar)).toBe(0);
  });

  it('says nothing at all about a channel or a knob no lane moves', () => {
    const lanes = [lane({ track: 2, target: 'bright' })];
    expect(automatedValue(lanes, 1, 'bright', 8, perBar)).toBeNull();
    expect(automatedValue(lanes, 2, 'level', 8, perBar)).toBeNull();
    expect(automatedValue([], 1, 'bright', 8, perBar)).toBeNull();
  });

  it('moves the channel VOICE, leaving the layers stacked above it alone', () => {
    const base = { ...DEFAULT_VOICE, bright: 50, sweep: 50 };
    const lonely = lane({ target: 'bright', from: 0, to: 100, startBar: 1, endBar: 1 });
    const moved = automatedVoice(base, [lonely], 1, 0, 1);
    expect(moved).not.toBeNull();
    expect(moved!.bright).toBe(100);
    // Every other knob is untouched, and the voice it was handed is left alone —
    // the engine asks the model again for the next note.
    expect(moved!.sweep).toBe(50);
    expect(base.bright).toBe(50);
  });

  it('hands back nothing rather than a copy when nothing moved', () => {
    const voice = { ...DEFAULT_VOICE, bright: 50 };
    // A lane that is on but says what the channel already says changes nothing,
    // which is how a lane that starts tomorrow leaves today alone.
    const same = lane({ target: 'bright', from: 50, to: 50 });
    expect(automatedVoice(voice, [same], 1, 0, 1)).toBeNull();
    expect(automatedVoice(voice, [], 1, 0, 1)).toBeNull();
  });

  it('ignores a lane that moves the level or the gate when asked for a voice', () => {
    const voice = { ...DEFAULT_VOICE, bright: 50 };
    const level = lane({ target: 'level', from: 0, to: 100 });
    expect(automatedVoice(voice, [level], 1, 0, 1)).toBeNull();
    expect(automatesVoice([level])).toBe(false);
    expect(automatesVoice([lane({ target: 'bright' })])).toBe(true);
  });

  it('stands in for a channel level only when it says something else', () => {
    const loud = lane({ target: 'level', from: 0, to: 0, startBar: 1, endBar: 1 });
    expect(automatedLevel([loud], 1, 80, 0, 1)).toBe(0);
    const same = lane({ target: 'level', from: 80, to: 80 });
    expect(automatedLevel([same], 1, 80, 0, 1)).toBeNull();
    expect(automatedLevel([], 1, 80, 0, 1)).toBeNull();
  });

  it('stands in for a channel gate only when it says something else', () => {
    const tight = lane({ target: 'gate', from: 80, to: 80 });
    expect(automatedGate([tight], 1, 0, 0, 1)).toBe(80);
    const same = lane({ target: 'gate', from: 0, to: 0 });
    expect(automatedGate([same], 1, 0, 0, 1)).toBeNull();
  });
});

describe('how a lane is written', () => {
  it('names the channel, both ends and the bars, for a menu', () => {
    expect(laneLabel(lane({ track: 2, target: 'bright', from: 15, to: 95, startBar: 8, endBar: 15 })))
      .toBe('CH 2 BRIGHT 15 -> 95 \u00b7 BARS 8-15');
    expect(laneLabel(lane({ startBar: 3, endBar: 3 }))).toContain('BAR 3');
  });

  it('writes the line the language reads back', () => {
    const one = lane({ track: 2, target: 'bright', from: 15, to: 95, startBar: 8, endBar: 15 });
    expect(laneScript(one)).toBe('automate 2 bright 15 95 bars 8 to 15');
    expect(lanesToScript([])).toBe('');
    expect(lanesToScript([one])).toBe(laneScript(one));
  });
});

describe('the word', () => {
  /** The published example, ready for one `automate` line. */
  const line = (text: string) => applyScript(createSong(), text);

  it('moves one value over a range of bars', () => {
    const result = line('automate 2 bright 15 95 bars 8 to 15');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.automation).toHaveLength(1);
    expect(result.song.automation[0]).toEqual({
      track: 2, target: 'bright', from: 15, to: 95, startBar: 8, endBar: 15,
    });
  });

  it('reads one bar as a lane that starts and ends there', () => {
    const result = line('automate 1 gate 0 90 bars 4');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.automation[0].startBar).toBe(4);
    expect(result.song.automation[0].endBar).toBe(4);
  });

  it('takes one lane per line, in reading order', () => {
    const result = line('automate 1 bright 0 100 bars 8 to 15\nautomate 1 bright 100 0 bars 16 to 23');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.automation.map((one) => one.startBar)).toEqual([8, 16]);
  });

  it('asks for a channel, a knob, two ends and the bars', () => {
    const bare = line('automate');
    expect(bare.ok).toBe(false);
    if (bare.ok) return;
    expect(bare.errors[0].message).toContain('automate needs a channel');
  });

  it('takes a channel NUMBER first, and says so when it is not one', () => {
    const named = line('automate pad bright 15 95 bars 1 to 4');
    expect(named.ok).toBe(false);
    if (named.ok) return;
    expect(named.errors[0].message).toContain('automate takes a channel NUMBER first');
    const missing = line('automate 9 bright 15 95 bars 1 to 4');
    expect(missing.ok).toBe(false);
  });

  it('refuses a word that is not something a lane can move, and names the targets', () => {
    const result = line('automate 2 drive 0 80 bars 1 to 4');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain('is not something a lane can move');
    // It names the list AND the reason the six effects are not on it, so an author
    // does not have to discover why the one obvious thing is missing.
    expect(result.errors[0].message).toContain('bright');
    expect(result.errors[0].message).toContain('set those on the track line instead');
  });

  it('refuses a pan lane, which is a place rather than a value', () => {
    const result = line('automate 2 pan -50 50 bars 1 to 4');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain('not something a lane can move');
  });

  it('needs both ends, and says what the range is', () => {
    const missing = line('automate 2 bright 15 bars 1 to 4');
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.errors[0].message).toContain('A lane needs both ends');
    expect(missing.errors[0].message).toContain('0..100');

    const high = line('automate 2 bright 15 140 bars 1 to 4');
    expect(high.ok).toBe(false);
    if (high.ok) return;
    expect(high.errors[0].message).toContain('runs 0..100');
  });

  it('needs the bars it spans, and reads them the way the order is written', () => {
    const missing = line('automate 2 bright 15 95');
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.errors[0].message).toContain('a lane needs the bars it spans');

    const wronged = line('automate 2 bright 15 95 bar 8 to 15');
    expect(wronged.ok).toBe(false);

    const outOfRange = line('automate 2 bright 15 95 bars 0 to 4');
    expect(outOfRange.ok).toBe(false);
    if (outOfRange.ok) return;
    expect(outOfRange.errors[0].message).toContain('bars are 1..');
  });

  it('refuses a backwards lane rather than guessing which way to read it', () => {
    const result = line('automate 2 bright 95 15 bars 8 to 4');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain('runs from an earlier bar to a later one');
    expect(result.errors[0].message).toContain('write two lanes');
  });

  it('stops at the ceiling, counting the lanes the song already carries', () => {
    const song = createSong();
    const full = applyScript(song, Array.from({ length: MAX_AUTOMATION_LANES }, (_, i) => `automate 1 bright 0 100 bars ${(i % 8) + 1}`).join('\n'));
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    expect(full.song.automation).toHaveLength(MAX_AUTOMATION_LANES);
    const oneMore = applyScript(full.song, 'automate 2 bright 0 100 bars 1');
    expect(oneMore.ok).toBe(false);
    if (oneMore.ok) return;
    expect(oneMore.errors[0].message).toContain(`at most ${MAX_AUTOMATION_LANES} automation lanes`);
  });

  it('is a command of its own, because a range is not a setting', () => {
    expect(SCRIPT_KEYWORDS).toContain('automate');
  });

  it('is cleared by `new`, like every other piece of the song', () => {
    // A script describes the WHOLE song, so a script that starts with `new` must
    // not inherit the last song's risers — and its own lanes must land ON TOP of
    // nothing rather than beside whatever was there. This is the one way a lane
    // could outlive the song that asked for it, and pasting a script twice is
    // exactly how it would show up.
    const moving = line('automate 1 bright 0 100 bars 1 to 4');
    expect(moving.ok).toBe(true);
    if (!moving.ok) return;
    expect(moving.song.automation).toHaveLength(1);
    const fresh = applyScript(moving.song, 'new\nsong "CLEAN"\ntracks 4');
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(fresh.song.automation).toEqual([]);
    // And applying the same script twice does not stack two copies of one lane.
    const twice = applyScript(moving.song, 'new\nsong "TWICE"\ntracks 4\nautomate 1 bright 0 100 bars 1 to 4');
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;
    expect(twice.song.automation).toHaveLength(1);
  });

  it('takes the two lines the quick reference shows', () => {
    // The panel's cheat sheet is prose with an unchecked fence around it, so the
    // line it shows is applied here instead: a reference that does not parse is
    // worse than no reference at all.
    const result = line('automate 1 gate 0 90 bars 1 to 2');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.automation[0]).toEqual({
      track: 1, target: 'gate', from: 0, to: 90, startBar: 1, endBar: 2,
    });
  });
});

describe('the file', () => {
  it('declares version 17 when a value moves, and 12 when nothing does', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    expect(raw.version).toBe(SONG_FILE_VERSION);
    expect(JSON.stringify(raw)).not.toContain('automation');

    const moving = applyScript(createSong(), 'automate 2 bright 15 95 bars 8 to 15');
    expect(moving.ok).toBe(true);
    if (!moving.ok) return;
    const file = songToJson(moving.song);
    expect(file).toContain(`"version": ${AUTOMATION_SONG_FILE_VERSION}`);
    expect(file).toContain('"automation"');
    expect(file).toContain('"target": "bright"');
  });

  it('writes a lane as a target, two values and a pair of bars', () => {
    const moving = applyScript(createSong(), 'automate 2 bright 15 95 bars 8 to 15');
    expect(moving.ok).toBe(true);
    if (!moving.ok) return;
    const raw = JSON.parse(songToJson(moving.song)) as { automation: unknown[] };
    expect(raw.automation[0]).toEqual({
      track: 2, target: 'bright', from: 15, to: 95, bars: [8, 15],
    });
  });

  it('reads a lane back byte for byte', () => {
    const moving = applyScript(createSong(), 'automate 2 bright 15 95 bars 8 to 15\nautomate 3 level 100 20 bars 1 to 9');
    expect(moving.ok).toBe(true);
    if (!moving.ok) return;
    const file = songToJson(moving.song);
    const back = songFromJson(file);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.automation).toEqual(moving.song.automation);
    expect(songToJson(back.song)).toBe(file);
  });

  it('writes the lanes into the script too, and reads them back', () => {
    const moving = applyScript(createSong(), 'automate 2 bright 15 95 bars 8 to 15');
    expect(moving.ok).toBe(true);
    if (!moving.ok) return;
    const script = songToScript(moving.song);
    expect(script).toContain('automate 2 bright 15 95 bars 8 to 15');
    const again = applyScript(createSong(), script);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.song.automation).toEqual(moving.song.automation);
  });

  it('opens a file written before lanes existed as a record that holds still', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const older = songFromJson(JSON.stringify({ ...raw, automation: undefined }));
    expect(older.ok).toBe(true);
    if (!older.ok) return;
    expect(older.song.automation).toEqual([]);
  });

  it('clamps a value it cannot use and refuses a shape it cannot read', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const withLane = (automation: unknown) => songFromJson(JSON.stringify({
      ...raw, version: AUTOMATION_SONG_FILE_VERSION, automation,
    }));

    const loud = withLane([{ track: 1, target: 'bright', from: -20, to: 400, bars: [1, 2] }]);
    expect(loud.ok).toBe(true);
    if (!loud.ok) return;
    expect(loud.song.automation[0].from).toBe(0);
    expect(loud.song.automation[0].to).toBe(100);

    // A lane naming a channel the song does not have is REFUSED rather than
    // dropped: there is no nearest sensible reading of "move the ninth channel".
    const missing = withLane([{ track: 9, target: 'bright', from: 0, to: 100, bars: [1, 2] }]);
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.errors.join(' ')).toContain('"track" that is a channel number');

    const unknown = withLane([{ track: 1, target: 'drive', from: 0, to: 100, bars: [1, 2] }]);
    expect(unknown.ok).toBe(false);

    const bars = withLane([{ track: 1, target: 'bright', from: 0, to: 100, bars: [8] }]);
    expect(bars.ok).toBe(false);
    if (bars.ok) return;
    expect(bars.errors.join(' ')).toContain('"bars": [first, last]');

    const backwards = withLane([{ track: 1, target: 'bright', from: 0, to: 100, bars: [9, 2] }]);
    expect(backwards.ok).toBe(false);

    const notNumbers = withLane([{ track: 1, target: 'bright', from: 'low', to: 100, bars: [1, 2] }]);
    expect(notNumbers.ok).toBe(false);

    const notAList = withLane({ track: 1 });
    expect(notAList.ok).toBe(false);
    if (notAList.ok) return;
    expect(notAList.errors.join(' ')).toContain('"automation" must be an array');
  });

  it('refuses a file with more lanes than a song can hold', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const many = songFromJson(JSON.stringify({
      ...raw,
      version: AUTOMATION_SONG_FILE_VERSION,
      automation: Array.from({ length: MAX_AUTOMATION_LANES + 1 }, () => ({
        track: 1, target: 'bright', from: 0, to: 100, bars: [1, 2],
      })),
    }));
    expect(many.ok).toBe(false);
    if (many.ok) return;
    expect(many.errors.join(' ')).toContain(`at most ${MAX_AUTOMATION_LANES} automation lanes`);
  });

  it('keeps a lane inside the bars the arrangement has', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const stretched = songFromJson(JSON.stringify({
      ...raw,
      version: AUTOMATION_SONG_FILE_VERSION,
      automation: [{ track: 1, target: 'bright', from: 0, to: 100, bars: [1, 9999] }],
    }));
    expect(stretched.ok).toBe(true);
    if (!stretched.ok) return;
    expect(stretched.song.automation[0].endBar).toBe(MAX_ORDER);
  });

  it('reads the bars a lane spans against one pattern, the same as the tempo map', () => {
    // The one number both the engine and the renderer hand over, so it is worth
    // pinning here: a bar of the arrangement IS one pattern.
    const song = createSong();
    expect(patternRows(song)).toBe(song.patterns[0].steps.length);
  });
});

describe('what the build says about it', () => {
  it('publishes the lanes, their ranges and where each value lands', () => {
    const { limits, vocabulary, versionNotes, scriptVersion } = scriptCapabilities();
    expect(limits.automationLanes.max).toBe(MAX_AUTOMATION_LANES);
    expect(limits.bars).toEqual({ min: 1, max: MAX_ORDER });
    expect(vocabulary.automationTargets.map((target) => target.id)).toEqual(AUTOMATION_TARGET_WORDS);
    expect(vocabulary.automationTargets.find((target) => target.id === 'level')?.scope).toBe('channel');
    expect(versionNotes.some((note) => note.version === 6 && note.note.includes('automate'))).toBe(true);
    expect(scriptVersion).toBeGreaterThanOrEqual(6);
  });

  it('publishes the file version a moving song declares', () => {
    const { fileVersions } = scriptCapabilities();
    // The newest version this build reads is the newest one any feature claims —
    // a later feature (sections) raised it past the lanes, so what a lane's own
    // version has to be is a version at all, and no longer the ceiling.
    expect(fileVersions.max).toBeGreaterThanOrEqual(AUTOMATION_SONG_FILE_VERSION);
    expect(AUTOMATION_SONG_FILE_VERSION).toBeGreaterThan(SONG_FILE_VERSION);
  });

  it('lists `automate` among the commands a tool can read', () => {
    const { commands, tiers } = scriptCapabilities();
    const command = commands.find((one) => one.word === 'automate');
    expect(command).toBeDefined();
    expect(command!.what).toContain('bars');
    expect(tiers.deep).toContain('automate');
  });
});
