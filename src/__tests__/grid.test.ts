import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  DEFAULT_ROWS,
  GRID_NAMES,
  GRID_NAME_LIST,
  gridShape,
  METER_UNITS,
  meterShape,
  patternRows,
  ROWS_PER_BEAT,
  SCRIPT_KEYWORDS,
  songToScript,
  STEPS_PER_WHOLE,
} from '../model';
import { scriptCapabilities, SCRIPT_VERSION } from '../model/capabilities';

/**
 * `grid` and `meter`, tested as the promise they are: **pure sugar over the
 * `steps`/`beat` pair, so nothing below them changes.**
 *
 * The half worth reading twice is the last test in each block — that a bar which
 * arrived from `meter 7 8` is written to a file as `beat 2` and `steps 14`, with
 * no `meter` anywhere. A sugar word that leaked into the model, the engine or the
 * file would mean the language had gained a second way to say what a bar is, and
 * that is the thing this whole module exists to avoid.
 */

/** A song whose bar is shaped by one line, so a test reads the pair it produced. */
function bar(source: string) {
  const result = applyScript(createSong(), `new\ntracks 2\n${source}`);
  if (!result.ok) throw new Error(`fixture does not parse: ${source} -> ${result.errors.map((e) => e.message).join(' | ')}`);
  return { steps: patternRows(result.song), stepsPerBeat: result.song.rowsPerBeat, song: result.song };
}

/** The message a refused line prints, so a test can read the wording. */
function refusal(source: string): string {
  const result = applyScript(createSong(), `new\ntracks 2\n${source}`);
  expect(result.ok).toBe(false);
  return result.ok ? '' : result.errors[0].message;
}

describe('a grid is a subdivision of the bar', () => {
  it('is a power of two, and a bar of them is sixteen at the default', () => {
    // Sixteen steps to the whole note is the anchor: `grid 16` is the default
    // grid, which is why a song that writes it is unchanged.
    expect(STEPS_PER_WHOLE).toBe(DEFAULT_ROWS);
    expect(gridShape('16')).toEqual({ steps: 16, stepsPerBeat: 4 });
    expect(gridShape('16')).toEqual({ steps: DEFAULT_ROWS, stepsPerBeat: ROWS_PER_BEAT });
    expect(gridShape('4')).toEqual({ steps: 4, stepsPerBeat: 1 });
    expect(gridShape('8')).toEqual({ steps: 8, stepsPerBeat: 2 });
    expect(gridShape('32')).toEqual({ steps: 32, stepsPerBeat: 8 });
    expect(gridShape('64')).toEqual({ steps: 64, stepsPerBeat: 16 });
  });

  it('puts three where two sat when the grid is a triplet', () => {
    // Eighths are two to the beat; eighth-note TRIPLETS are three, so a bar is
    // twelve steps rather than eight — the shuffle the roadmap was reaching for.
    expect(gridShape('8t')).toEqual({ steps: 12, stepsPerBeat: 3 });
    expect(gridShape('16t')).toEqual({ steps: 24, stepsPerBeat: 6 });
    expect(gridShape('32t')).toEqual({ steps: 48, stepsPerBeat: 12 });
  });

  it('takes a name however it is typed', () => {
    expect(gridShape(' 16 ')).toEqual(gridShape('16'));
    expect(gridShape('16T')).toEqual(gridShape('16t'));
  });

  it('answers null for anything that is not a grid a song can hold', () => {
    // Too coarse (half a step to the beat), not a power of two, too fine (a
    // thirty-second step to the beat), and things that are not grids at all.
    expect(gridShape('2')).toBeNull();
    expect(gridShape('6')).toBeNull();
    expect(gridShape('128')).toBeNull();
    expect(gridShape('64t')).toBeNull();
    expect(gridShape('0')).toBeNull();
    expect(gridShape('-16')).toBeNull();
    expect(gridShape('4.5')).toBeNull();
    expect(gridShape('16x')).toBeNull();
    expect(gridShape('')).toBeNull();
    expect(gridShape('waltz')).toBeNull();
  });

  it('publishes exactly the names it accepts', () => {
    // The list in the error message and the manifest is the set that WORKS: every
    // name it offers resolves, and every name that resolves is offered.
    for (const name of GRID_NAMES) expect(gridShape(name)).not.toBeNull();
    expect(GRID_NAME_LIST).toBe(GRID_NAMES.join(', '));
    expect(GRID_NAMES).toContain('16');
    expect(GRID_NAMES).toContain('8t');
    expect(GRID_NAMES).not.toContain('128');
  });
});

describe('a meter is a time signature', () => {
  it('reads beats and the note one beat is', () => {
    expect(meterShape(4, 4)).toEqual({ steps: 16, stepsPerBeat: 4 });
    expect(meterShape(3, 4)).toEqual({ steps: 12, stepsPerBeat: 4 });
    expect(meterShape(7, 8)).toEqual({ steps: 14, stepsPerBeat: 2 });
    expect(meterShape(6, 8)).toEqual({ steps: 12, stepsPerBeat: 2 });
    expect(meterShape(5, 8)).toEqual({ steps: 10, stepsPerBeat: 2 });
    expect(meterShape(2, 2)).toEqual({ steps: 16, stepsPerBeat: 8 });
    expect(meterShape(1, 16)).toEqual({ steps: 1, stepsPerBeat: 1 });
    expect(meterShape(12, 8)).toEqual({ steps: 24, stepsPerBeat: 2 });
  });

  it('answers null for a bar that is not one this app can say', () => {
    expect(meterShape(0, 4)).toBeNull();
    expect(meterShape(-3, 4)).toBeNull();
    expect(meterShape(1.5, 4)).toBeNull();
    // A beat that is a whole number of steps, and a bar within the 512 a song holds.
    expect(meterShape(4, 3)).toBeNull();
    expect(meterShape(4, 32)).toBeNull();
    expect(meterShape(4, 0)).toBeNull();
    expect(meterShape(300, 8)).toBeNull();
    expect(meterShape(513, 16)).toBeNull();
    expect(meterShape(1, 1)).toEqual({ steps: 16, stepsPerBeat: 16 });
  });

  it('publishes the note values it accepts', () => {
    for (const unit of METER_UNITS) expect(meterShape(4, unit)).not.toBeNull();
    expect(METER_UNITS).toContain(8);
    expect(METER_UNITS).not.toContain(3);
  });
});

describe('grid and meter in a script', () => {
  it('set the steps and the beat, exactly as `steps`/`beat` would', () => {
    expect(bar('grid 8t')).toMatchObject({ steps: 12, stepsPerBeat: 3 });
    expect(bar('meter 7 8')).toMatchObject({ steps: 14, stepsPerBeat: 2 });
    // The plain pair, said the old way, is the same bar.
    expect(bar('steps 12\nbeat 3')).toMatchObject({ steps: 12, stepsPerBeat: 3 });
    expect(bar('steps 14\nbeat 2')).toMatchObject({ steps: 14, stepsPerBeat: 2 });
  });

  it('is the last line about the bar that counts, whichever word it uses', () => {
    expect(bar('steps 32\nbeat 8\ngrid 16')).toMatchObject({ steps: 16, stepsPerBeat: 4 });
    expect(bar('grid 8t\nmeter 3 4')).toMatchObject({ steps: 12, stepsPerBeat: 4 });
    expect(bar('meter 7 8\ngrid 8t')).toMatchObject({ steps: 12, stepsPerBeat: 3 });
    expect(bar('grid 8t\nbeat 4')).toMatchObject({ steps: 12, stepsPerBeat: 4 });
  });

  it('holds exactly as many rows as the grid it set', () => {
    // A grid is a bar length, so writing past it is the same mistake `steps` has
    // always caught — and the row cursor comes back inside a grid that shrinks.
    const five = applyScript(createSong(), 'new\ntracks 1\ngrid 4\npattern 1\nC-4\nD-4\nE-4\nF-4\nG-4');
    expect(five.ok).toBe(false);
    if (five.ok) return;
    expect(five.errors.some((e) => e.message.includes('no row 4'))).toBe(true);

    const four = applyScript(createSong(), 'new\ntracks 1\ngrid 4\npattern 1\nC-4\nD-4\nE-4\nF-4');
    expect(four.ok).toBe(true);
    if (!four.ok) return;
    expect(patternRows(four.song)).toBe(4);
  });

  it('is cleared by `new`, like every other setting', () => {
    const shaped = applyScript(createSong(), 'new\ntracks 2\nmeter 7 8');
    expect(shaped.ok).toBe(true);
    if (!shaped.ok) return;
    const fresh = applyScript(shaped.song, 'new\ntracks 2');
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(patternRows(fresh.song)).toBe(DEFAULT_ROWS);
    expect(fresh.song.rowsPerBeat).toBe(ROWS_PER_BEAT);
  });

  it('refuses a grid and a meter it cannot make a bar out of, and lists the choices', () => {
    expect(refusal('grid 128')).toContain(GRID_NAME_LIST);
    expect(refusal('grid 6')).toContain('power of two');
    expect(refusal('grid')).toContain('needs one name');
    expect(refusal('grid 16 32')).toContain('needs one name');
    expect(refusal('meter 7')).toContain('needs two numbers');
    expect(refusal('meter 7 3')).toContain(METER_UNITS.join(', '));
    expect(refusal('meter 300 8')).toContain('512');
  });
});

describe('the bar is still two numbers underneath', () => {
  it('writes `steps` and `beat`, and no sugar word, into the file', () => {
    // The whole point: the model, the engine, the renderer and the file never
    // learn that `grid` and `meter` exist. A song shaped by a meter saves as the
    // pair it stands for, and reads back identical.
    const { song } = bar('meter 7 8');
    const script = songToScript(song);
    expect(script).toContain('steps 14');
    expect(script).toContain('beat 2');
    expect(script).not.toContain('meter');
    expect(script).not.toContain('grid');

    const again = applyScript(createSong(), script);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(patternRows(again.song)).toBe(14);
    expect(again.song.rowsPerBeat).toBe(2);
  });

  it('is published as sugar, not as a new kind of bar', () => {
    const manifest = scriptCapabilities();
    // This version or later: grid was added at 8, and later words move it on.
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(8);
    expect(manifest.scriptVersion).toBe(SCRIPT_VERSION);
    expect(manifest.versionNotes.map((entry) => entry.version)).toContain(8);
    expect(manifest.keywords).toContain('grid');
    expect(manifest.keywords).toContain('meter');
    expect(manifest.vocabulary.grids).toEqual([...GRID_NAMES]);
    expect(manifest.vocabulary.meterUnits).toEqual([...METER_UNITS]);
    // The words sit with `steps`/`beat` in the keyword list, because that is what
    // they are: another way of saying it.
    expect(SCRIPT_KEYWORDS.indexOf('grid')).toBe(SCRIPT_KEYWORDS.indexOf('steps') + 1);
    expect(SCRIPT_KEYWORDS.indexOf('meter')).toBe(SCRIPT_KEYWORDS.indexOf('grid') + 1);
  });
});
