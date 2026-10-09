/**
 * The ARP page's run: where its chord comes from, where its cells land, and the
 * one computation the preview, the audition and the write all share.
 *
 * The claim this file holds is the page's central promise, one level above
 * [`arpGenerator`](arpGenerator.test.ts): `arpRun` is the ONLY thing that decides
 * which notes a run plays and which rows it plays them on, so what the page draws,
 * what `HEAR RUN` sounds and what `WRITE RUN` commits cannot disagree — and a run
 * still stops at the pattern's edge, whatever the pattern's length.
 */

import { describe, expect, it } from 'vitest';

import {
  applyScript,
  arpAuditionSpacingMs,
  arpRun,
  arpSource,
  baseMidiForOctave,
  chordPitches,
  clampArp,
  createSong,
  DEFAULT_ARP,
  generateArp,
  progressionStepNotes,
  withProgressionSteps,
  type ArpRunInput,
  type ArpSettings,
} from '../model';
import {
  MAX_ROLL_STEPS,
  arpDestinationLine,
  arpReplaceNote,
  arpSummary,
  chordCaption,
  dialCaption,
  formatRow,
  rollBlock,
  rollGrid,
  rollStepCenter,
  rollWindow,
  fitText,
  hearRunLabel,
  sliderKnobX,
  sliderValueAt,
} from '../ui/arpBoard';

/** An A minor triad at octave 4 — what `chord 0 1 Am` resolves to. */
const AM = chordPitches(baseMidiForOctave(4) + 9, 'minor');

function settings(over: Partial<ArpSettings> = {}): ArpSettings {
  return clampArp({ ...DEFAULT_ARP, ...over });
}

function input(over: Partial<ArpRunInput> = {}): ArpRunInput {
  return {
    settings: settings(),
    cell: AM,
    progression: null,
    key: createSong().key,
    pattern: 0,
    track: 2,
    row: 0,
    rows: 16,
    ...over,
  };
}

/** A song whose progression is the one the argument names, at the default hold. */
function songWithProgression(source: string) {
  const result = applyScript(createSong(), `tracks 1\ntrack 1 "ARP" voice pluck\n${source}\n`);
  if (!result.ok) throw new Error(result.errors.map((e) => `line ${e.line}: ${e.message}`).join(' / '));
  return result.song;
}

describe('where a run’s chord comes from', () => {
  it('CHORD mode walks the cell the destination points at', () => {
    const resolved = arpSource({ mode: 'chord', cell: AM, progression: null, key: createSong().key, row: 0 });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.source.tones).toEqual(AM);
    expect(resolved.source.from).toBe('cell');
    expect(resolved.source.chord).toBe('Am');
  });

  it('names a stack that is not a chord with no name rather than a wrong one', () => {
    // A whole-tone pair is not a chord this build knows; the page shows the notes
    // it is walking and does not invent a chord symbol for them.
    const resolved = arpSource({ mode: 'chord', cell: [60, 62], progression: null, key: createSong().key, row: 0 });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.source.chord).toBe('');
    expect(resolved.source.tones).toEqual([60, 62]);
  });

  it('refuses an empty cell in words that say what to do', () => {
    const resolved = arpSource({ mode: 'chord', cell: [], progression: null, key: createSong().key, row: 0 });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toContain('no chord in this cell');
    expect(resolved.reason).toContain('SONG SOURCE');
  });

  it('SONG SOURCE walks the song’s progression at the destination row', () => {
    const song = songWithProgression('progression Am F C G');
    const resolved = arpSource({ mode: 'source', cell: [], progression: song.progression, key: song.key, row: 0 });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.source.from).toBe('progression');
    expect(resolved.source.chord).toBe('Am');
    // The same notes `chord 0 1 follow` writes for the loop's first chord.
    expect(resolved.source.tones).toEqual(progressionStepNotes(song.progression!.steps[0], song.key, 4));
  });

  it('follows the loop round, so a later row walks that row’s chord', () => {
    const song = songWithProgression('progression Am F C G');
    const hold = song.progression!.hold;
    const third = arpSource({ mode: 'source', cell: [], progression: song.progression, key: song.key, row: hold * 2 });
    const fourth = arpSource({ mode: 'source', cell: [], progression: song.progression, key: song.key, row: hold * 3 });
    expect(third.ok && third.source.chord).toBe('C');
    expect(fourth.ok && fourth.source.chord).toBe('G');
    // And a row past the loop wraps rather than running out.
    const wrapped = arpSource({ mode: 'source', cell: [], progression: song.progression, key: song.key, row: hold * 4 });
    expect(wrapped.ok && wrapped.source.chord).toBe('Am');
  });

  it('refuses a song with no progression, naming the line that would fix it', () => {
    const resolved = arpSource({ mode: 'source', cell: AM, progression: null, key: createSong().key, row: 0 });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toContain('no progression');
    expect(resolved.reason).toContain('progression Am F C G');
    expect(resolved.reason).toContain('CHORD');
  });

  it('reads the loop at the octave a follower voices it at', () => {
    const song = songWithProgression('progression Am');
    const resolved = arpSource({ mode: 'source', cell: [], progression: song.progression, key: song.key, row: 0 });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.source.tones[0]).toBe(baseMidiForOctave(4) + 9);
    expect(resolved.source.tones).toEqual(AM);
  });
});

describe('the run preview, audition and write all share', () => {
  it('is exactly `generateArp` with the room the pattern has', () => {
    const result = arpRun(input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.steps).toEqual(generateArp(AM, 0, settings(), 16));
  });

  it('stops at the pattern edge, and says which row it stopped on', () => {
    const result = arpRun(input({ row: 14, rows: 16 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.steps.map((step) => step.step)).toEqual([14, 15]);
    expect(result.run.destination.lastRow).toBe(15);
    expect(result.run.destination.cells).toBe(2);
  });

  it('carries the destination: pattern, channel and start row', () => {
    const result = arpRun(input({ pattern: 2, track: 4, row: 4 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.destination.pattern).toBe(2);
    expect(result.run.destination.track).toBe(4);
    expect(result.run.destination.row).toBe(4);
  });

  it('counts the rows a write would replace, and only those', () => {
    const result = arpRun(input({ row: 0, rows: 16, occupied: [0, 1, 2, 4] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The run lands on even rows 0..10; 0, 2, 4 and 10 were occupied.
    expect(result.run.steps.map((step) => step.step)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.run.destination.replaced).toBe(4);
  });

  it('reports nothing replaced when the rows are empty', () => {
    const result = arpRun(input({ occupied: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.destination.replaced).toBe(0);
  });

  it('passes a source’s refusal straight through, rather than an empty run', () => {
    const result = arpRun(input({ cell: [] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('no chord in this cell');
  });

  it('is empty at a pattern with no room left, without being a refusal', () => {
    const result = arpRun(input({ row: 16, rows: 16 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.steps).toEqual([]);
    expect(result.run.destination.cells).toBe(0);
    expect(result.run.destination.lastRow).toBe(16);
  });

  it('walks the progression when the mode says so, and the cell when it does not', () => {
    const song = songWithProgression('progression Am F C G');
    const shared = {
      settings: settings({ mode: 'source' as const }),
      cell: chordPitches(baseMidiForOctave(4), 'major'), // C, deliberately not Am
      progression: song.progression,
      key: song.key,
      pattern: 0,
      track: 0,
      row: 0,
      rows: 16,
    };
    const asSource = arpRun(shared);
    expect(asSource.ok).toBe(true);
    if (!asSource.ok) return;
    expect(asSource.run.source.chord).toBe('Am');
    expect(asSource.run.source.tones).toEqual(AM);

    const asCell = arpRun({ ...shared, settings: settings({ mode: 'chord' }) });
    expect(asCell.ok).toBe(true);
    if (!asCell.ok) return;
    expect(asCell.run.source.from).toBe('cell');
    expect(asCell.run.source.tones).not.toEqual(AM);
  });

  it('agrees with `arp write` cell for cell, for the same dials', () => {
    // The parity claim one level above the generator: the cells a WRITE commits
    // are the cells the page's run describes, at every rate and direction.
    for (const direction of ['up', 'down', 'updown'] as const) {
      for (const rate of [1, 2, 3] as const) {
        const dials = settings({ direction, rate, octaves: 2, gate: 60 });
        const result = arpRun(input({ settings: dials, cell: AM, rows: 16 }));
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        const script = `steps 16\ntracks 1\ntrack 1 "ARP" voice pluck\npattern 1 "A"\narp direction ${direction}\narp octaves 2 rate ${rate} gate 60\narp mode chord\narp write 0 1 Am\n`;
        const song = (() => {
          const applied = applyScript(createSong(), script);
          if (!applied.ok) throw new Error(applied.errors.map((e) => e.message).join(' / '));
          return applied.song;
        })();
        const written = Array.from({ length: 16 }, (_one, row) => song.patterns[0].steps[row]?.[0] ?? null);
        for (const step of result.run.steps) {
          const cell = written[step.step];
          expect(cell?.note).toBe(step.note);
          expect(cell?.velocity).toBe(step.velocity);
        }
        // And nothing outside the reported destination moved.
        for (const [row, cell] of written.entries()) {
          if (result.run.steps.some((step) => step.step === row)) continue;
          expect(cell?.note).toBeNull();
        }
      }
    }
  });
});

describe('the page’s write and `arp write` agree about velocity', () => {
  it('overwrites a cell’s old velocity with the run’s, the way the page promises', () => {
    // A cell that already holds a soft note is exactly the case a grid can be in
    // and a fresh script cannot: the page DRAWS velocity 75 on that row, so the
    // write has to leave 75 there rather than the number that was there before.
    const script = 'steps 16\ntracks 1\ntrack 1 "ARP" voice pluck\npattern 1 "A"\n'
      + 'arp octaves 1 rate 1 gate 75\narp mode chord\n'
      + 'C-4~40\narp write 0 1 Am\n';
    const applied = applyScript(createSong(), script);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const row0 = applied.song.patterns[0].steps[0][0];
    expect(row0.velocity).toBe(75);
    const page = arpRun(input({ settings: settings({ octaves: 1, rate: 1, gate: 75 }), cell: AM, rows: 16 }));
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.run.steps[0]).toEqual({ step: 0, note: 69, velocity: 75 });
  });
});

describe('audition timing follows the dials', () => {
  it('spaces the notes by `rate` rows, not by one row', () => {
    const row = 0.1;
    expect(arpAuditionSpacingMs(settings({ rate: 1 }), row)).toBe(100);
    expect(arpAuditionSpacingMs(settings({ rate: 2 }), row)).toBe(200);
    expect(arpAuditionSpacingMs(settings({ rate: 4 }), row)).toBe(400);
  });

  it('keeps a positive gap at any tempo, so notes never stack', () => {
    expect(arpAuditionSpacingMs(settings({ rate: 1 }), 0)).toBe(1);
    expect(arpAuditionSpacingMs(settings({ rate: 1 }), -1)).toBe(1);
  });
});

describe('what the page says about the dials', () => {
  it('describes each dial in a sentence about what it does', () => {
    expect(dialCaption(settings({ direction: 'up' }), 'direction')).toBe('Play notes from low to high.');
    expect(dialCaption(settings({ direction: 'down' }), 'direction')).toBe('Play notes from high to low.');
    expect(dialCaption(settings({ direction: 'updown' }), 'direction')).toContain('come back down');
    expect(dialCaption(settings(), 'octaves')).toBe('How many trips through the chord: 2.');
    expect(dialCaption(settings({ octaves: 1 }), 'octaves')).toBe('One trip through the chord.');
    expect(dialCaption(settings({ rate: 1 }), 'rate')).toBe('One note per step.');
    expect(dialCaption(settings({ rate: 3 }), 'rate')).toBe('One note every 3 steps.');
    expect(dialCaption(settings(), 'gate')).toBe('Sets note velocity.');
    expect(dialCaption(settings({ mode: 'chord' }), 'mode')).toContain('cell at the cursor');
    expect(dialCaption(settings({ mode: 'source' }), 'mode')).toContain('progression');
  });

  it('summarises the run in the words the grid plays in', () => {
    expect(arpSummary(settings({ direction: 'up', octaves: 2, rate: 2, gate: 75 })))
      .toBe('UP  ·  2 OCTAVES  ·  EVERY 2 STEPS  ·  VELOCITY 75%');
    expect(arpSummary(settings({ direction: 'down', octaves: 1, rate: 1, gate: 100 })))
      .toBe('DOWN  ·  1 OCTAVE  ·  EVERY STEP  ·  VELOCITY 100%');
  });

  it('names the destination before anything is written', () => {
    const result = arpRun(input({ pattern: 0, track: 2, row: 0, rows: 16 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(arpDestinationLine(result.run.destination)).toBe('PAT 1  ·  TRACK 3  ·  ROWS 00 – 05');
  });

  it('says whether a write lands on notes or on empty rows', () => {
    const empty = arpRun(input({ occupied: [] }));
    const over = arpRun(input({ occupied: [0, 1, 2, 3, 4, 5] }));
    expect(empty.ok && arpReplaceNote(empty.run.destination)).toBe('6 generated cells  ·  the rows they land on are empty.');
    expect(over.ok && arpReplaceNote(over.run.destination))
      .toBe('6 generated cells  ·  6 notes at those rows are replaced.');
  });

  it('says there is nothing to write when the run is empty', () => {
    const result = arpRun(input({ row: 16, rows: 16 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(arpReplaceNote(result.run.destination)).toContain('Nothing to write');
  });

  it('prints rows the way the grid does', () => {
    expect(formatRow(0)).toBe('00');
    expect(formatRow(10)).toBe('10');
    expect(formatRow(63)).toBe('63');
  });
});

describe('the chord readout names where its chord came from', () => {
  it('says AT CURSOR for a cell and THE PROGRESSION for the loop', () => {
    expect(chordCaption('chord')).toBe('CHORD AT CURSOR:');
    expect(chordCaption('source')).toBe('CHORD FROM THE PROGRESSION:');
    expect(chordCaption('chord')).not.toBe(chordCaption('source'));
  });
});

describe('the HEAR RUN button says which verb it is', () => {
  it('offers to play when nothing is sounding', () => {
    expect(hearRunLabel(false, true)).toBe('\u25b6  HEAR RUN');
  });

  it('offers to STOP while the run is still echoing', () => {
    expect(hearRunLabel(true, true)).toBe('\u25a0  STOP');
    // Even if the run has become unwritable in the meantime, a sound being made
    // is a sound that needs a way to stop it.
    expect(hearRunLabel(true, false)).toBe('\u25a0  STOP');
  });

  it('does not offer to play a run that does not exist', () => {
    expect(hearRunLabel(false, false)).toBe('\u25b6  NO RUN');
  });
});

describe('the pitch-versus-step roll', () => {
  const rect = { x: 100, y: 50, width: 300, height: 132 };

  it('gives every pitch the run sounds one row, highest first', () => {
    const grid = rollGrid([57, 60, 64, 69, 72, 76], 12, rect);
    expect(grid.rows.map((row) => row.pitch)).toEqual([76, 72, 69, 64, 60, 57]);
    expect(grid.rows[0].y).toBe(rect.y);
    expect(grid.rowHeight).toBe(22);
    expect(grid.labelBlocks).toBe(true);
    expect(grid.labelRows).toBe(true);
  });

  it('drops a pitch sounded twice to one row', () => {
    const grid = rollGrid([60, 60, 64, 60], 8, rect);
    expect(grid.rows.map((row) => row.pitch)).toEqual([64, 60]);
  });

  it('fits any number of pitches inside the rect rather than overflowing it', () => {
    const many = Array.from({ length: 32 }, (_one, i) => 40 + i);
    const grid = rollGrid(many, 12, rect);
    const last = grid.rows[grid.rows.length - 1];
    expect(last.y + last.height).toBeLessThanOrEqual(rect.y + rect.height + 1);
    // 32 rows is under five pixels each, so neither the axis nor the blocks are
    // labelled — a smear of two note names would be worse than no name.
    expect(grid.labelRows).toBe(false);
  });

  it('shows a short pattern whole, from its first step', () => {
    const grid = rollGrid([60, 64], 12, rect);
    expect(grid.columns.map((column) => column.step)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(grid.columns[0].x).toBe(rect.x);
  });

  it('slides a window over a long pattern so the run’s start stays visible', () => {
    const grid = rollGrid([60, 64], 64, rect, 40);
    expect(grid.columns.length).toBe(MAX_ROLL_STEPS);
    expect(grid.columns[0].step).toBe(32);
    expect(grid.columns[grid.columns.length - 1].step).toBe(63);
    // A start row that leaves no room for a whole window pins to the end.
    expect(rollWindow(64, 63)).toBe(32);
    expect(rollWindow(64, 10)).toBe(10);
    expect(rollWindow(12, 10)).toBe(0);
  });

  it('gives a note its block, and nothing for a note off the roll', () => {
    const grid = rollGrid([60, 64], 12, rect);
    const block = rollBlock(grid, 2, 64);
    expect(block).not.toBeNull();
    if (!block) return;
    expect(block.x).toBe(Math.round(rect.x + 2 * 25 + 1));
    expect(block.y).toBe(rect.y);
    expect(rollBlock(grid, 2, 61)).toBeNull();
    expect(rollBlock(grid, 99, 64)).toBeNull();
  });

  it('centres a step’s number over its column', () => {
    const grid = rollGrid([60], 4, rect);
    expect(rollStepCenter(grid, 0)).toBe(rect.x + rect.width / 8);
    expect(rollStepCenter(grid, 3)).toBe(rect.x + rect.width * 7 / 8);
    expect(rollStepCenter(grid, 9)).toBeNull();
  });
});

describe('fitting a string into a fixed panel', () => {
  it('leaves a short string exactly as it is', () => {
    expect(fitText('AM', 100, 7)).toBe('AM');
  });

  it('cuts a long one to the width and marks the cut', () => {
    const out = fitText('UP  ·  2 OCTAVES  ·  EVERY 2 STEPS  ·  VELOCITY 75%', 60, 7);
    expect(out.endsWith('\u2026')).toBe(true);
    expect(out.length * 7 * 0.62).toBeLessThanOrEqual(60);
  });

  it('never returns nothing, however narrow the panel', () => {
    expect(fitText('SOMETHING LONG', 0, 7).length).toBeGreaterThan(0);
    expect(fitText('SOMETHING LONG', 1, 7).length).toBeGreaterThan(0);
  });
});

describe('the intensity slider', () => {
  const track = { x: 20, y: 100, width: 200, height: 6 };
  const knob = 10;

  it('puts the knob’s centre on the ends of the range', () => {
    expect(sliderKnobX(track, 0, knob)).toBe(25);
    expect(sliderKnobX(track, 100, knob)).toBe(215);
    expect(sliderKnobX(track, 50, knob)).toBe(120);
  });

  it('reads a value back out of a pointer, snapped to the step', () => {
    expect(sliderValueAt(25, track, knob)).toBe(0);
    expect(sliderValueAt(215, track, knob)).toBe(100);
    expect(sliderValueAt(120, track, knob)).toBe(50);
    expect(sliderValueAt(122, track, knob)).toBe(50);
    expect(sliderValueAt(126, track, knob)).toBe(55);
  });

  it('clamps a pointer that ran off either end', () => {
    expect(sliderValueAt(-500, track, knob)).toBe(0);
    expect(sliderValueAt(9999, track, knob)).toBe(100);
  });

  it('round-trips: a knob’s x reads back as the value that put it there', () => {
    for (const value of [0, 15, 40, 75, 100]) {
      expect(sliderValueAt(sliderKnobX(track, value, knob), track, knob)).toBe(value);
    }
  });
});

describe('the progression is real song data, not a fixture', () => {
  it('reflects a held loop, so a long chord covers more rows', () => {
    const song = songWithProgression('progression Am F hold 8');
    expect(song.progression).toEqual(withProgressionSteps(song.progression!.steps, 8));
    const first = arpSource({ mode: 'source', cell: [], progression: song.progression, key: song.key, row: 0 });
    const second = arpSource({ mode: 'source', cell: [], progression: song.progression, key: song.key, row: 8 });
    expect(first.ok && first.source.chord).toBe('Am');
    expect(second.ok && second.source.chord).toBe('F');
  });
});
