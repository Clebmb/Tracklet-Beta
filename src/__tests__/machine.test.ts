import { describe, expect, it } from 'vitest';

import {
  MACHINE_SONG_FILE_VERSION,
  SONG_FILE_VERSION,
  clampMachineBeat,
  clampMachineSteps,
  clampPadIndex,
  clampTune,
  countMachineHits,
  createMachine,
  defaultPad,
  describeMachine,
  emptyRow,
  machineActive,
  machineHit,
  machineLabel,
  MAX_PADS,
  padAt,
  padPatternChar,
  padPatternString,
  padPatternVelocity,
  parsePadPattern,
  resizeMachine,
  resizeRow,
  tidyPadName,
  withPad,
  DEFAULT_MACHINE_BEAT,
  DEFAULT_MACHINE_STEPS,
  MAX_MACHINE_BEAT,
  MAX_MACHINE_STEPS,
  MAX_TUNE,
  applyScript,
  songToScript,
  MIN_MACHINE_BEAT,
  MIN_MACHINE_STEPS,
  MIN_TUNE,
  createSong,
  songFromJson,
  songToJson,
  type DrumMachine,
} from '../model';
import {
  machineDucks,
  machineGain,
  machineHitsInRange,
  machineHitsOnStep,
  machineLoopRows,
  machineUnitRows,
  padStripOptions,
} from '../audio/machine';

describe('machine ranges', () => {
  it('clamps steps, beat and tune into their published ranges', () => {
    expect(clampMachineSteps(0)).toBe(MIN_MACHINE_STEPS);
    expect(clampMachineSteps(999)).toBe(MAX_MACHINE_STEPS);
    expect(clampMachineSteps(16.4)).toBe(16);
    expect(clampMachineSteps(NaN)).toBe(DEFAULT_MACHINE_STEPS);

    expect(clampMachineBeat(0)).toBe(MIN_MACHINE_BEAT);
    expect(clampMachineBeat(99)).toBe(MAX_MACHINE_BEAT);
    expect(clampMachineBeat(NaN)).toBe(DEFAULT_MACHINE_BEAT);

    expect(clampTune(-99)).toBe(MIN_TUNE);
    expect(clampTune(99)).toBe(MAX_TUNE);
    expect(clampTune(2.6)).toBe(3);
  });

  it('clamps a pad number into 1..MAX_PADS', () => {
    expect(clampPadIndex(0)).toBe(1);
    expect(clampPadIndex(MAX_PADS + 4)).toBe(MAX_PADS);
    expect(clampPadIndex(3.2)).toBe(3);
  });

  it('tidies a pad name to one upper-case token', () => {
    expect(tidyPadName('  big   kick ')).toBe('BIG-KICK');
  });
});

describe('the pads a machine seeds', () => {
  it('starts as four silent kit drums', () => {
    const machine = createMachine();
    expect(machine.enabled).toBe(true);
    expect(machine.steps).toBe(DEFAULT_MACHINE_STEPS);
    expect(machine.beat).toBe(DEFAULT_MACHINE_BEAT);
    expect(machine.pads).toHaveLength(4);
    expect(machine.pads.map((pad) => pad.name)).toEqual(['KICK', 'SNARE', 'HAT', 'WIND']);
    expect(machine.pads.map((pad) => pad.pitch)).toEqual([36, 38, 42, 44]);
    for (const pad of machine.pads) expect(pad.steps).toEqual(emptyRow(DEFAULT_MACHINE_STEPS));
    expect(countMachineHits(machine)).toBe(0);
  });

  it('seeds pads 5-8 with the four extras, as generators this app already speaks', () => {
    const names = [5, 6, 7, 8].map((n) => defaultPad(n, 8).name);
    expect(names).toEqual(['TOM', 'CLAP', 'CRASH', 'RIDE']);
    for (const n of [5, 6, 7, 8]) {
      const pad = defaultPad(n, 8);
      expect(['sine', 'triangle', 'sawtooth', 'square', 'noise', 'table', 'sample', 'fm', 'string',
        'formant', 'organ', 'granular', 'font', 'reed', 'brass', 'bow', 'mallet', 'membrane', 'plate'])
        .toContain(pad.voice.wave);
      expect(pad.steps).toHaveLength(8);
    }
  });

  it('clamps a pad past the ceiling back onto the last one', () => {
    expect(defaultPad(99, 8).name).toBe('RIDE');
  });
});

describe('a pad pattern string', () => {
  it('maps a velocity onto one character and back', () => {
    expect(padPatternChar(0)).toBe('.');
    expect(padPatternChar(100)).toBe('9');
    expect(padPatternChar(1)).toBe('1');
    expect(padPatternVelocity('.')).toBe(0);
    expect(padPatternVelocity('9')).toBe(100);
    expect(padPatternVelocity('5')).toBe(56);
    expect(padPatternVelocity('x')).toBeNull();
    for (let n = 1; n <= 9; n++) {
      expect(padPatternChar(padPatternVelocity(String(n))!)).toBe(String(n));
    }
  });

  it('reads a row, padding the tail with rests', () => {
    const parsed = parsePadPattern('9...9', 8, 'KICK');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.row).toEqual([100, 0, 0, 0, 100, 0, 0, 0]);
    expect(padPatternString(parsed.row, 8)).toBe('9...9...');
  });

  it('refuses a pattern longer than the machine, and says how to widen it', () => {
    const parsed = parsePadPattern('9...9...9...9...9...', 16, 'KICK');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('20-step pattern');
    expect(parsed.message).toContain('machine steps 20');
  });

  it('refuses a character that is neither a rest nor a digit', () => {
    const parsed = parsePadPattern('9..x', 8, 'HAT');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain('"x"');
    expect(parsed.message).toContain('1-9');
  });

  it('accepts a quoted string, so a script can write one', () => {
    const parsed = parsePadPattern('"9...9..."', 8, 'KICK');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.row).toEqual([100, 0, 0, 0, 100, 0, 0, 0]);
  });
});

describe('resizing a machine', () => {
  it('grows every row with rests and shrinks the tail', () => {
    const machine = createMachine(4);
    machine.pads[0].steps = [100, 0, 56, 0];
    const grown = resizeMachine(machine, 8);
    expect(grown.steps).toBe(8);
    expect(grown.pads[0].steps).toEqual([100, 0, 56, 0, 0, 0, 0, 0]);
    const shrunk = resizeMachine(grown, 2);
    expect(shrunk.pads[0].steps).toEqual([100, 0]);
  });

  it('resizes a bare row into a plain list', () => {
    expect(resizeRow([100, 50], 4)).toEqual([100, 50, 0, 0]);
    expect(resizeRow([100, 50, 25], 2)).toEqual([100, 50]);
  });
});

describe('reading a machine', () => {
  it('grows the pad list with defaults so pad 5 always means the fifth pad', () => {
    const machine = createMachine(16);
    const grown = withPad(machine, 5, { ...defaultPad(5, 16), name: 'FLOOR TOM' });
    expect(grown.pads).toHaveLength(5);
    expect(grown.pads[4].name).toBe('FLOOR TOM');
    expect(grown.pads[3].name).toBe('WIND');
  });

  it('reads a hit, counts hits, and calls a machine active only when it can sound', () => {
    let machine = createMachine(4);
    expect(machineActive(machine)).toBe(false);
    machine = { ...machine, pads: machine.pads.map((pad, i) => (i === 0 ? { ...pad, steps: [100, 0, 0, 56] } : pad)) };
    expect(machineHit(machine, 1, 0)).toBe(100);
    expect(machineHit(machine, 1, 1)).toBe(0);
    expect(machineHit(machine, 9, 0)).toBe(0);
    expect(countMachineHits(machine)).toBe(2);
    expect(machineActive(machine)).toBe(true);
    expect(machineActive({ ...machine, enabled: false })).toBe(false);
    expect(machineActive(null)).toBe(false);
  });

  it('describes a machine as numbers and pattern strings, without sharing state', () => {
    const machine = createMachine(8);
    machine.pads[1].steps = [0, 0, 0, 0, 100, 0, 0, 0];
    const described = describeMachine(machine);
    expect(described.pads[1].pattern).toBe('....9...');
    expect(described.effects).not.toBe(machine.effects);
    described.effects.drive = 50;
    expect(machine.effects.drive).toBe(0);
  });

  it('labels the machine for a status line', () => {
    const machine = createMachine(16);
    expect(machineLabel(machine)).toContain('NO HITS YET');
    expect(machineLabel({ ...machine, enabled: false })).toContain('MACHINE OFF');
    expect(machineLabel({ ...machine, pads: machine.pads.map((pad) => ({ ...pad, steps: pad.steps.map(() => 100) })) }))
      .toContain('64 HITS');
  });

  it('keeps a machine a plain value that can be copied and read without a song', () => {
    const machine = createMachine(16);
    expect(padAt(machine, 2)?.pitch).toBe(38);
    expect(padAt(machine, 9)).toBeNull();
    expect(JSON.parse(JSON.stringify(machine))).toEqual(machine);
  });
});

describe('a machine in a song file', () => {
  it('writes no machine key, and the base version, for a song that has none', () => {
    const fresh = createSong();
    expect(fresh.machine).toBeNull();
    const raw = JSON.parse(songToJson(fresh)) as Record<string, unknown>;
    expect(raw.version).toBe(SONG_FILE_VERSION);
    expect(raw).not.toHaveProperty('machine');
  });

  it('round-trips a machine through the JSON format', () => {
    const song = createSong();
    const machine = createMachine(8);
    machine.pads[0] = { ...machine.pads[0], steps: [100, 0, 0, 0, 56, 0, 0, 0] };
    machine.pads[1] = { ...machine.pads[1], steps: [0, 0, 0, 0, 80, 0, 0, 0] };
    machine.swing = 50;
    machine.effects.tape = 25;
    song.machine = machine;

    const raw = JSON.parse(songToJson(song)) as Record<string, unknown>;
    expect(raw.version).toBe(MACHINE_SONG_FILE_VERSION);
    expect(raw.machine).toBeTruthy();

    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.machine).toEqual(machine);
  });

  it('keeps a pad\'s tuned pitch through the JSON format', () => {
    // The file writes a pad's ABSOLUTE pitch, so reading only the `tune` a script
    // uses would quietly reset a tuned pad to its kit drum on every save and load.
    const song = createSong();
    const machine = createMachine(4);
    machine.pads[0] = { ...machine.pads[0], pitch: 43, pan: -30, level: 55 };
    song.machine = machine;

    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const pad = back.song.machine?.pads[0];
    expect(pad?.pitch).toBe(43);
    expect(pad?.pan).toBe(-30);
    expect(pad?.level).toBe(55);
  });

  it('loads a file with no machine as a song with none', () => {
    const back = songFromJson(songToJson(createSong()));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.machine).toBeNull();
  });

  it('refuses a machine that is not an object', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const bad = songFromJson(JSON.stringify({ ...raw, version: MACHINE_SONG_FILE_VERSION, machine: 'yes' }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors.join(' ')).toContain('"machine"');
  });

  it('refuses a machine with more pads than it may have', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const pads = Array.from({ length: MAX_PADS + 1 }, () => ({ name: 'PAD' }));
    const bad = songFromJson(JSON.stringify({ ...raw, version: MACHINE_SONG_FILE_VERSION, machine: { steps: 16, pads } }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors.join(' ')).toContain(`may have ${MAX_PADS}`);
  });

  it('reads a broken pad leniently: a bad character is a rest and a bad name is the kit drum', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const machine = {
      steps: 4,
      pads: [{ name: '   ', pattern: '9.x.' }],
    };
    const back = songFromJson(JSON.stringify({ ...raw, version: MACHINE_SONG_FILE_VERSION, machine }));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const pad = back.song.machine?.pads[0];
    expect(pad?.name).toBe('KICK');
    expect(pad?.steps).toEqual([100, 0, 0, 0]);
  });
});

describe('the drum machine in a script', () => {
  const run = (source: string) => applyScript(createSong(), source);
  const four = 'machine level 85 swing 50\npad 1 KICK voice kick pattern "9...9...9...9..."';

  it('creates the machine from the first line about it', () => {
    const result = run('new\n' + four);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const machine = result.song.machine;
    expect(machine).not.toBeNull();
    expect(machine?.level).toBe(85);
    expect(machine?.swing).toBe(50);
    expect(machine?.pads).toHaveLength(4);
    expect(machine?.pads[0].name).toBe('KICK');
    expect(machine?.pads[0].steps.slice(0, 4)).toEqual([100, 0, 0, 0]);
    expect(countMachineHits(machine!)).toBe(4);
  });

  it('lets `machine steps` widen the pads written below it', () => {
    const result = run('new\nmachine steps 8\npad 1 KICK pattern "9...9..."');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.machine?.steps).toBe(8);
    expect(result.song.machine?.pads[0].steps).toHaveLength(8);
  });

  it('refuses a pad pattern longer than the machine, with the fix in the message', () => {
    const result = run('new\npad 1 KICK pattern "' + '9'.repeat(20) + '"');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain('20-step pattern');
  });

  it('refuses a pad character that is not a rest or a digit', () => {
    const result = run('new\npad 1 KICK pattern "9..x"');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain('"x"');
  });

  it('refuses a setting a machine does not take', () => {
    const result = run('new\nmachine hold 4');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toContain('machine does not take');
  });

  it('does not call a machine-only song empty', () => {
    const result = run('new\n' + four);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.advisories.join(' ')).not.toContain('no notes');
  });

  it('round-trips a machine through SAVE AS SCRIPT', () => {
    const built = run('new\n' + four);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const script = songToScript(built.song);
    expect(script).toContain('machine');
    expect(script).toContain('swing 50');
    expect(script).toContain('level 85');
    expect(script).toContain('pad 1 "KICK" voice kick');
    expect(script).toContain('pattern "9...9...9...9..."');
    const again = applyScript(createSong(), script);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.song.machine).toEqual(built.song.machine);
  });
});

/**
 * Where a machine lands in the song's clock — the half the live engine and the
 * offline renderer share, so a beat cannot sound one way live and another in a
 * file. Pure arithmetic, so it is checked here rather than in a browser.
 *
 * `rowsPerBeat` is 4 everywhere unless a test says otherwise: four rows to the
 * beat is the app's own default, so a machine at `beat 4` is one step per row and
 * every number below can be read off the grid. A machine at `beat 8` is the other
 * half of the story — two machine steps per row — and is checked on its own.
 */
describe('where a machine lands in the song', () => {
  /** A row from a pattern string, which must parse. */
  function row(pattern: string, steps: number): number[] {
    const parsed = parsePadPattern(pattern, steps, 'TEST');
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.row;
  }

  /** A machine whose pad 1 is the pattern, everything else as seeded. */
  function withKick(pattern: string, steps = 16): DrumMachine {
    const machine = createMachine(steps);
    const kick = padAt(machine, 1)!;
    return withPad(machine, 1, { ...kick, steps: row(pattern, steps) });
  }

  it('reads one machine step as one song row at four-and-four', () => {
    expect(machineUnitRows(withKick('9...'), 4)).toBe(1);
    // A machine counting eight to a beat over a song counting four: half a row.
    expect(machineUnitRows({ ...withKick('9...'), beat: 8 }, 4)).toBe(0.5);
    // ...and the other way: a slow machine, two rows to its step.
    expect(machineUnitRows({ ...withKick('9...'), beat: 2 }, 4)).toBe(2);
  });

  it('lays a straight loop out one row per step', () => {
    const rows = machineLoopRows(withKick('9...'), 4);
    expect(rows).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('leans a pair without changing the loop length, the way the song does', () => {
    const straight = machineLoopRows(withKick('9...'), 4);
    const swung = machineLoopRows({ ...withKick('9...'), swing: 100 }, 4);
    // The loop is exactly as long — swing moves hits, it does not slow a bar.
    expect(swung[16]).toBeCloseTo(straight[16]!, 10);
    // Every pair still spans two steps, and the first of it is the longer one.
    expect(swung[1]).toBeGreaterThan(1);
    expect(swung[2]).toBeCloseTo(2, 10);
    expect(swung[2]! - swung[1]!).toBeLessThan(1);
  });

  it('places four-on-the-floor on rows 0, 4, 8 and 12', () => {
    const machine = withKick('9...9...9...9...');
    const hits = machineHitsInRange(machine, 4, 0, 16);
    expect(hits.map((hit) => hit.row)).toEqual([0, 4, 8, 12]);
    expect(hits.every((hit) => hit.pad === 1 && hit.velocity === 100)).toBe(true);
  });

  it('loops the machine past its own bar, so a one-bar beat fills the song', () => {
    const machine = withKick('9...9...9...9...');
    const hits = machineHitsInRange(machine, 4, 0, 64);
    expect(hits.map((hit) => hit.row)).toEqual([0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60]);
    // The machine step is the one WITHIN the loop, so a tool can name it.
    expect(hits.map((hit) => hit.step)).toEqual([0, 4, 8, 12, 0, 4, 8, 12, 0, 4, 8, 12, 0, 4, 8, 12]);
  });

  it('is half-open, so stepping by one schedules each hit exactly once', () => {
    const machine = withKick('9...9...9...9...');
    const walked = [0, 1, 2, 3].flatMap((step) => machineHitsInRange(machine, 4, step, step + 1));
    const whole = machineHitsInRange(machine, 4, 0, 4);
    expect(walked.map((hit) => [hit.row, hit.pad])).toEqual(whole.map((hit) => [hit.row, hit.pad]));
  });

  it('places a machine counting eight to the beat between the rows', () => {
    // 16 steps at beat 8 = two beats of half-row steps: a hat twice a row.
    const machine = { ...withKick('9.9.9.9.9.9.9.9.'), beat: 8 };
    const hits = machineHitsInRange(machine, 4, 0, 8);
    expect(hits.map((hit) => hit.row)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('reads a machine that is off or empty as nothing to schedule', () => {
    expect(machineHitsInRange(withKick('9...............'), 4, 0, 16)).toHaveLength(1);
    expect(machineHitsInRange({ ...withKick('9...............'), enabled: false }, 4, 0, 16)).toHaveLength(0);
    expect(machineHitsInRange(createMachine(16), 4, 0, 16)).toHaveLength(0);
    expect(machineHitsInRange(null, 4, 0, 16)).toHaveLength(0);
  });

  it('reports the pads that fire on one step, in pad order', () => {
    let machine = withKick('9...5...', 8);
    const snare = padAt(machine, 2)!;
    machine = withPad(machine, 2, { ...snare, steps: row('9.......', 8) });
    expect(machineHitsOnStep(machine, 0)).toEqual([
      { pad: 1, padIndex: 0, velocity: 100 },
      { pad: 2, padIndex: 1, velocity: 100 },
    ]);
    expect(machineHitsOnStep(machine, 4)).toEqual([{ pad: 1, padIndex: 0, velocity: 56 }]);
    expect(machineHitsOnStep(machine, 99)).toEqual([]);
  });

  it('folds the machine fader and its group into one gain', () => {
    const machine = { ...createMachine(), level: 100, bus: 'DRUMS' };
    expect(machineGain(machine)).toBe(1);
    expect(machineGain(machine, 50)).toBe(0.5);
    expect(machineGain({ ...machine, level: 80 }, 50)).toBeCloseTo(0.4, 10);
    // A group level that is not a number is "no group", not silence.
    expect(machineGain(machine, Number.NaN)).toBe(1);
  });

  it('ducks only when it is on and asks to', () => {
    expect(machineDucks(createMachine(16))).toBe(false);
    expect(machineDucks({ ...createMachine(16), duck: 40 })).toBe(true);
    expect(machineDucks({ ...createMachine(16), duck: 40, enabled: false })).toBe(false);
    expect(machineDucks(null)).toBe(false);
  });

  it('gives each pad a strip that is its fader and its place in the field', () => {
    const pad = { ...defaultPad(1, 8), level: 50, pan: -60 };
    // Level reaches the chain as a GAIN (0..1), the unit every channel's is in;
    // pan is the same −100..100 every other strip takes. No sends, no effects.
    expect(padStripOptions(pad)).toEqual({ level: 0.5, pan: -60, verb: 0, echo: 0 });
  });

  it('clamps a pad strip the way the model clamps the pad', () => {
    const pad = { ...defaultPad(1, 8), level: 500, pan: -400 };
    expect(padStripOptions(pad)).toEqual({ level: 1, pan: -100, verb: 0, echo: 0 });
  });
});
