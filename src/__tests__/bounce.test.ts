import { describe, expect, it } from 'vitest';

import { renderSeconds } from '../audio/render';
import {
  applyScript,
  BOUNCE_WORD,
  bounceBars,
  bounceLabel,
  bounceMarkFor,
  bounceMarkStatus,
  bounceReaches,
  bounceScript,
  bounceSteps,
  createSong,
  fitBounce,
  markBounce,
  markedBounce,
  NO_BOUNCE,
  songFromJson,
  songToJson,
  songToMidi,
  songToScript,
  SONG_FILE_VERSION,
  createSong as blank,
  type Song,
} from '../model';

/**
 * The export region — the loop region.
 *
 * The audio itself cannot be rendered here (no `OfflineAudioContext` in a headless
 * runner), so what is checked is everything that decides WHICH samples would be
 * made: the statement and its refusals, the `L` mark's three presses, the fit to
 * an order that is shorter than the range, the span of the song's clock a range
 * covers, and — the claim every session setting has to prove — that a region moves
 * no byte of a song.
 */

/** A song from a script that must parse. */
function song(source: string): Song {
  const result = applyScript(createSong(), source);
  if (!result.ok) {
    throw new Error(`the fixture does not parse: ${result.errors.map((e) => `${e.line}: ${e.message}`).join(' | ')}`);
  }
  return result.song;
}

function settingsOf(source: string): ReturnType<typeof applyScript> & { ok: true } {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`the fixture does not parse: ${result.errors.map((e) => e.message).join(' | ')}`);
  return result as ReturnType<typeof applyScript> & { ok: true };
}

/** Four bars of one pattern, one note each, so an order is a real thing to cut. */
const FOUR_BARS = `new
song "FOUR"
tempo 120
tracks 1
track 1 "LEAD" voice lead
pattern 1 "A"
C-4
.  
.  
.  
pattern 2 "B"
E-4
.  
.  
.  
pattern 3 "C"
G-4
.  
.  
.  
pattern 4 "D"
C-5
.  
.  
.  
order 1 2 3 4
`;

describe('the statement', () => {
  it('sets the bars an export renders', () => {
    expect(settingsOf('new\nexport bars 8 to 15\n').settings.bounce).toEqual({ from: 8, to: 15 });
    expect(settingsOf('export bars 3 to 3\n').settings.bounce).toEqual({ from: 3, to: 3 });
  });

  it('takes `all` as the whole song, which is a value rather than silence', () => {
    const result = settingsOf('export bars 2 to 4\nexport all\n');
    expect(result.settings.bounce).toBeNull();
  });

  it('leaves the setting alone when a script says nothing about a region', () => {
    expect(settingsOf('new\ntracks 1\n').settings.bounce).toBeUndefined();
  });

  it('lets the last line win, like every other setting', () => {
    expect(settingsOf('export bars 1 to 2\nexport bars 4 to 6\n').settings.bounce).toEqual({ from: 4, to: 6 });
  });

  it('is one of the words the language has', () => {
    expect(BOUNCE_WORD).toBe('export');
    expect(bounceScript({ from: 8, to: 15 })).toBe('export bars 8 to 15');
  });
});

describe('the refusals', () => {
  const refuse = (source: string): string => {
    const result = applyScript(createSong(), source);
    if (result.ok) throw new Error('this script applies, so it is not a refusal.');
    return result.errors.map((error) => error.message).join('\n');
  };

  it('asks for something a line can set', () => {
    // The refusal changed shape when a loudness target joined the statement — a
    // bare `export` is now missing a target as readily as a region — so these are
    // the sentences the parser prints rather than the ones it printed before.
    expect(refuse('export\n')).toContain('export needs something to set');
    expect(refuse('export 8 to 15\n')).toContain('export takes nothing else after that');
    expect(refuse('export bars 8\n')).toContain('two whole bar numbers');
    expect(refuse('export bars 8 from 15\n')).toContain('two whole bar numbers');
    expect(refuse('export bars 8 to 15 extra\n')).toContain('export takes nothing else after that');
    expect(refuse('export all 8\n')).toContain('export takes nothing else after that');
  });

  it('asks for whole bar numbers', () => {
    expect(refuse('export bars eight to 15\n')).toContain('two whole bar numbers');
    expect(refuse('export bars 1 to 2.5\n')).toContain('two whole bar numbers');
  });

  it('counts bars from 1, and refuses a range that reads backwards', () => {
    expect(refuse('export bars 0 to 4\n')).toContain('bars are counted from 1');
    expect(refuse('export bars 15 to 8\n')).toContain('counts backwards');
  });

  it('names its own line', () => {
    const result = applyScript(createSong(), 'new\nexport bars 9 to 3\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.line).toBe(2);
  });

  it('is not refused for reaching past the order, only advised', () => {
    const result = settingsOf(`${FOUR_BARS}export bars 3 to 9\n`);
    expect(result.settings.bounce).toEqual({ from: 3, to: 9 });
    expect(result.summary.advisories.join('\n')).toContain('the export range reaches bar 9');
  });

  it('says nothing at all about a range that fits', () => {
    const result = settingsOf(`${FOUR_BARS}export bars 2 to 3\n`);
    expect(result.summary.advisories.join('\n')).not.toContain('export range');
  });
});

describe('fitting a range to the song', () => {
  it('clamps both ends into the order it was given', () => {
    expect(fitBounce({ from: 8, to: 15 }, 4)).toEqual({ from: 4, to: 4 });
    expect(fitBounce({ from: 0, to: 2 }, 4)).toEqual({ from: 1, to: 2 });
    expect(fitBounce({ from: 2, to: 99 }, 4)).toEqual({ from: 2, to: 4 });
  });

  it('orders the two ends even though the parser refuses a backwards range', () => {
    expect(fitBounce({ from: 9, to: 2 }, 12)).toEqual({ from: 2, to: 9 });
  });

  it('reaches past the order only when the end does', () => {
    expect(bounceReaches({ from: 1, to: 5 }, 4)).toBe(true);
    expect(bounceReaches({ from: 1, to: 4 }, 4)).toBe(false);
  });

  it('counts the bars it covers, and says which ones', () => {
    expect(bounceBars(null, 4)).toBe(4);
    expect(bounceBars({ from: 2, to: 3 }, 4)).toBe(2);
    expect(bounceBars({ from: 3, to: 9 }, 4)).toBe(2);
    expect(bounceLabel(null, 4)).toBe('THE WHOLE SONG');
    expect(bounceLabel({ from: 4, to: 4 }, 9)).toBe('BAR 4');
    expect(bounceLabel({ from: 8, to: 15 }, 16)).toBe('BARS 8-15');
    expect(bounceLabel({ from: 8, to: 15 }, 4)).toBe('BAR 4');
  });
});

describe('the span of the song a range covers', () => {
  it('is the whole song when there is no range', () => {
    const four = song(FOUR_BARS);
    expect(bounceSteps(four, null)).toEqual({ first: 0, last: 64 });
    expect(bounceSteps(four, undefined)).toEqual({ first: 0, last: 64 });
  });

  it('is bars of the grid, counted from the order', () => {
    const four = song(FOUR_BARS);
    expect(bounceSteps(four, { from: 2, to: 3 })).toEqual({ first: 16, last: 48 });
    expect(bounceSteps(four, { from: 4, to: 4 })).toEqual({ first: 48, last: 64 });
  });

  it('follows a longer grid, where a bar is two patterns', () => {
    const wide = song(`${FOUR_BARS}steps 32\n`);
    expect(bounceSteps(wide, { from: 2, to: 2 })).toEqual({ first: 32, last: 64 });
  });

  it('fits a range that reaches past the order rather than running off the end', () => {
    const four = song(FOUR_BARS);
    expect(bounceSteps(four, { from: 3, to: 99 })).toEqual({ first: 32, last: 64 });
  });

  it('is what the length of a render is measured against', () => {
    // The pure half of the renderer takes the same option, so a region's LENGTH
    // can be checked without a browser: two bars of a four-bar song are as long as
    // a two-bar song, tail included.
    const four = song(FOUR_BARS);
    const two = song(`new\nsong "TWO"\ntempo 120\ntracks 1\ntrack 1 "LEAD" voice lead\npattern 1 "A"\nC-4\n.\n.\n.\npattern 2 "B"\nE-4\n.\n.\n.\norder 1 2\n`);
    expect(renderSeconds(four, { bounce: { from: 2, to: 3 } })).toBeCloseTo(renderSeconds(two), 6);
    expect(renderSeconds(four, { bounce: { from: 2, to: 3 } })).toBeLessThan(renderSeconds(four));
    expect(renderSeconds(four, { bounce: null })).toBe(renderSeconds(four));
  });
});

describe('the L mark in F3', () => {
  it('begins a region, finishes it, and takes it off', () => {
    const started = markBounce(NO_BOUNCE, 3);
    expect(started).toEqual({ kind: 'start', bar: 3 });
    expect(markedBounce(started)).toBeNull();

    const region = markBounce(started, 7);
    expect(markedBounce(region)).toEqual({ from: 3, to: 7 });

    expect(markBounce(region, 7)).toEqual(NO_BOUNCE);
  });

  it('finishes in either direction, because the cursor is where the hand is', () => {
    expect(markedBounce(markBounce(markBounce(NO_BOUNCE, 7), 3))).toEqual({ from: 3, to: 7 });
    expect(markedBounce(markBounce(markBounce(NO_BOUNCE, 3), 3))).toEqual({ from: 3, to: 3 });
  });

  it('starts a NEW region anywhere but the bar it ends at', () => {
    const region = markBounce(markBounce(NO_BOUNCE, 2), 6);
    expect(markBounce(region, 3)).toEqual({ kind: 'start', bar: 3 });
    expect(markBounce(region, 6)).toEqual(NO_BOUNCE);
  });

  it('says what it did, in one line, every press', () => {
    expect(bounceMarkStatus(NO_BOUNCE, 8)).toBe('LOOP OFF - THE WHOLE SONG EXPORTS.');
    expect(bounceMarkStatus({ kind: 'start', bar: 3 }, 8)).toContain('LOOP STARTS AT BAR 3');
    const region = markBounce(markBounce(NO_BOUNCE, 3), 7);
    expect(bounceMarkStatus(region, 8)).toBe('LOOP BARS 3-7 - PRESS L ON BAR 7 TO TAKE IT OFF.');
  });

  it('goes back and forth from a settings value', () => {
    expect(bounceMarkFor(null)).toEqual(NO_BOUNCE);
    expect(markedBounce(bounceMarkFor({ from: 4, to: 5 }))).toEqual({ from: 4, to: 5 });
  });
});

describe('a region changes nothing about the song', () => {
  it('leaves the file format, the version and every note alone', () => {
    const before = song(FOUR_BARS);
    const written = songToJson(before);
    const version = (JSON.parse(written) as { version?: number }).version;
    const result = settingsOf(`${FOUR_BARS}export bars 2 to 3\n`);
    expect(songToJson(result.song)).toBe(written);
    expect(version).toBe(SONG_FILE_VERSION);
    expect(songFromJson(written).ok).toBe(true);
  });

  it('is never written back into a saved script', () => {
    // A region is what you are DOING with a song, like `theme` and `solo`: the
    // writer takes the settings it is handed, and a region is not one of them.
    const text = songToScript(song(FOUR_BARS), { volume: null, bounce: { from: 2, to: 3 } });
    expect(text).not.toContain('export bars');
  });

  it('is not in the JSON either', () => {
    const text = songToJson(song(FOUR_BARS), { volume: null, bounce: { from: 2, to: 3 } });
    expect(text).not.toContain('bounce');
  });
});

describe('the region reaches the note writers', () => {
  it('writes only the bars of the region as MIDI', () => {
    const four = song(FOUR_BARS);
    const whole = songToMidi(four);
    const region = songToMidi(four, { from: 2, to: 3 });
    expect(whole.ok).toBe(true);
    expect(region.ok).toBe(true);
    if (!whole.ok || !region.ok) return;
    expect(whole.summary.notes).toBe(4);
    expect(whole.summary.bars).toBe(4);
    expect(region.summary.notes).toBe(2);
    expect(region.summary.bars).toBe(2);
    // A shorter file, and the same notes at the same velocity: a region renders a
    // PART of a song rather than a rearranged one.
    expect(region.bytes.length).toBeLessThan(whole.bytes.length);
  });

  it('refuses a region with no notes in it, in the words the writer already uses', () => {
    const empty = song(`new\ntracks 1\ntrack 1 "LEAD" voice lead\npattern 1 "A"\nC-4\n.\n.\n.\npattern 2 "B"\n.\n.\n.\n.\norder 1 2\n`);
    expect(songToMidi(empty).ok).toBe(true);
    const result = songToMidi(empty, { from: 2, to: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('nothing to export');
  });

  it('is a plan about the WHOLE song otherwise, so both writers agree', () => {
    // The two pure readers of a region: one says which steps, one says which bars.
    const four = song(FOUR_BARS);
    const range = { from: 2, to: 2 };
    const span = bounceSteps(four, range);
    expect(span.last - span.first).toBe(bounceBars(range, four.order.length) * 16);
  });
});

describe('the manifest', () => {
  it('publishes the word, with an example that applies', async () => {
    const { scriptCapabilities } = await import('../model/capabilities');
    const manifest = scriptCapabilities();
    const command = manifest.commands.find((entry) => entry.word === 'export');
    expect(command).toBeDefined();
    expect(command?.example).toContain('export bars');
    expect(manifest.keywords).toContain('export');
    expect(manifest.limits.bars.min).toBe(1);
  });

  it('is at least the version that added the word, and names it in its notes', async () => {
    // Not pinned to the current number: the language keeps growing, and what
    // matters about `export` is that version 19 is the one that introduced it and
    // that a tool reading the notes can find that out. `loudness.test.ts` pins the
    // version itself, because the newest word is what that file is about.
    const { SCRIPT_VERSION, SCRIPT_VERSION_NOTES } = await import('../model/capabilities');
    expect(SCRIPT_VERSION).toBeGreaterThanOrEqual(19);
    expect(SCRIPT_VERSION_NOTES.find((entry) => entry.version === 19)?.note).toContain('EXPORT REGION');
  });
});

describe('an empty song still has something to say about a region', () => {
  it('advises rather than refusing, because the order can grow afterwards', () => {
    const result = settingsOf('new\ntracks 1\nexport bars 4 to 6\n');
    expect(result.settings.bounce).toEqual({ from: 4, to: 6 });
    // A blank song has no notes, which is its own advisory, and the region
    // reaches past its single bar — both observations, no refusal.
    expect(result.summary.advisories.length).toBeGreaterThan(0);
  });

  it('fits to the one bar such a song has', () => {
    expect(bounceSteps(blank(), { from: 4, to: 6 })).toEqual({ first: 0, last: 16 });
  });
});
