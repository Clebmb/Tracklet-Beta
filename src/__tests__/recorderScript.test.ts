import { describe, expect, it } from 'vitest';

import { captureRefusal } from '../audio/recorder';
import { SCRIPT_COMMANDS, SCRIPT_VERSION } from '../model/capabilities';
import { applyScript, SCRIPT_KEYWORDS } from '../model/script';
import { createSong } from '../model/song';
import {
  loopTakeByName,
  makeTake,
  takeLoop,
  takeWindow,
  trimTakeByName,
  type Take,
} from '../model/take';

/**
 * The `record` word, and the takes it shapes.
 *
 * A take is APP state — the other half of the `sample` bargain — so these tests
 * are about two things at once: that the LANGUAGE reads the four statements a
 * `record` line can be, and that the pure arithmetic they hand to the scene
 * really trims and loops a take. The capture itself needs a browser, so what can
 * be tested here is the honest REFUSAL a build with no input gives.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(result.errors.map((error) => `line ${error.line}: ${error.message}`).join(' / '));
  return result;
}

/** A take of one second, with no trim and no loop. */
function take(name = 'HOOK'): Take {
  return makeTake(name, 1, 0.8);
}

describe('the record word', () => {
  it('is a keyword, and the manifest knows it', () => {
    expect(SCRIPT_KEYWORDS).toContain('record');
    const at = SCRIPT_KEYWORDS.indexOf('record');
    expect(SCRIPT_COMMANDS[at].word).toBe('record');
    expect(SCRIPT_COMMANDS[at].example).toBe('record trim HOOK 0.1 2.0');
  });

  it('reads `record NAME` as a capture, and never touches the song', () => {
    const song = createSong();
    const result = applied('record HOOK\n');
    expect(result.settings.recordCapture).toBe('HOOK');
    expect(result.song).toEqual(song);
  });

  it('reads `record trim` and `record loop`, in the order written', () => {
    const result = applied('record trim HOOK 0.1 2.0\nrecord loop HOOK 0.5 1.5\nrecord trim BASS 1.0 3.0\n');
    expect(result.settings.recordTrims).toEqual([
      { name: 'HOOK', start: 0.1, end: 2.0 },
      { name: 'BASS', start: 1.0, end: 3.0 },
    ]);
    expect(result.settings.recordLoops).toEqual([{ name: 'HOOK', start: 0.5, end: 1.5 }]);
  });

  it('reads `record select` as a session setting', () => {
    const result = applied('record select HOOK\n');
    expect(result.settings.recordSelect).toBe('HOOK');
  });

  it('tidies a quoted name like every other name', () => {
    // A name is one word, so a quote is just how the language tells a NAME from a
    // setting — the value stored is the word.
    expect(applied('record "HOOK"\n').settings.recordCapture).toBe('HOOK');
  });

  it('refuses a shape it cannot read, naming the line', () => {
    const cases: readonly { source: string; says: string }[] = [
      { source: 'record\n', says: 'record needs a take name to capture' },
      { source: 'record HOOK EXTRA\n', says: 'record takes one take name to capture' },
      { source: 'record trim HOOK\n', says: 'record trim needs a take name and two times in seconds' },
      { source: 'record loop HOOK 1.0\n', says: 'record loop needs a take name and two times in seconds' },
      { source: 'record trim 02brk 0.1 2.0\n', says: 'record trim names a take' },
      { source: 'record HOOK -1 2\n', says: 'record trim' },
      { source: 'record trim HOOK nope 2.0\n', says: "takes two times in seconds from the take's own start" },
      { source: 'record select\n', says: 'record select needs a take name' },
      { source: 'record select 2nd\n', says: 'record select names a take' },
      { source: 'record 02brk\n', says: 'record names a take' },
    ];
    for (const entry of cases) {
      const result = applyScript(createSong(), entry.source);
      expect(result.ok, entry.source).toBe(false);
      if (result.ok) continue;
      expect(result.errors[0].message, entry.source).toContain(entry.says);
    }
  });

  it('does not bank a capture when there is no input — it says so instead', () => {
    // The capture is the scene's, and the scene refuses through this sentence. In
    // a test runner there is no microphone, so the honest answer is a refusal in
    // words rather than a silent no-op — the `export.audio` precedent.
    expect(captureRefusal()).not.toBeNull();
  });

  it('reports the language version the word arrived in', () => {
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(49);
  });
});

describe('the take helpers a `record` line applies through', () => {
  it('finds a take by name in any case', () => {
    const takes = [take('HOOK'), take('BASS')];
    expect(trimTakeByName(takes, 'hook', 0.1, 0.5).found).toBe(true);
    expect(loopTakeByName(takes, 'bass', 0.1, 0.5).found).toBe(true);
    // A name that is not there changes nothing and says so.
    const missing = trimTakeByName(takes, 'NOPE', 0.1, 0.5);
    expect(missing.found).toBe(false);
    expect(missing.takes).toEqual(takes);
  });

  it('trims the named take and leaves the others alone', () => {
    const takes = [take('HOOK'), take('BASS')];
    const shaped = trimTakeByName(takes, 'HOOK', 0.2, 0.7);
    expect(takeWindow(shaped.takes[0])).toMatchObject({ start: 0.2, end: 0.7 });
    expect(takeWindow(shaped.takes[1])).toEqual(takeWindow(takes[1]));
  });

  it('loops inside the window, and drops the loop when a trim moves past it', () => {
    const looped = loopTakeByName([take('HOOK')], 'HOOK', 0.2, 0.6).takes[0];
    expect(takeLoop(looped)).toMatchObject({ start: 0.2, end: 0.6 });
    // Trimming to a window that no longer contains the loop re-fits it: the loop
    // cannot sit outside the part that plays.
    const trimmed = trimTakeByName([looped], 'HOOK', 0.0, 0.3).takes[0];
    const loop = takeLoop(trimmed);
    if (loop) {
      expect(loop.start).toBeGreaterThanOrEqual(0.0);
      expect(loop.end).toBeLessThanOrEqual(0.3);
    }
  });

  it('keeps a fresh take overlapping the whole recording as "no loop"', () => {
    // A loop that spans the whole window is what a fresh take carries, and it must
    // read as no loop rather than as a loop over everything.
    expect(takeLoop(take('HOOK'))).toBeNull();
  });
});
