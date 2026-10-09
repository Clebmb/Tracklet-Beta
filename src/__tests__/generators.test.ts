import { describe, expect, it } from 'vitest';

import {
  applyScript,
  arpDirectionFromName,
  arpNotes,
  ARP_ALIASES,
  ARP_DIRECTIONS,
  ARP_WORD,
  articulationHits,
  chordGestureReply,
  createSong,
  DEFAULT_ARP_DIRECTION,
  MAX_ARP_STEPS,
  MAX_ORDER,
  MAX_ROWS,
  MIDI_MAX,
  MIN_ARP_STEPS,
  MIN_REPEAT,
  MAX_REPEAT,
  REPEAT_WORD,
  rowNotes,
  SCRIPT_KEYWORDS,
  secondsPerRow,
  songFromJson,
  songToJson,
  songToScript,
  SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  type Song,
} from '../model';
import { scriptCapabilities } from '../model/capabilities';
import { noteLength } from '../audio/synth';

/**
 * Generators: the idioms an author says instead of typing out.
 *
 * The roadmap named six — `repeat`, `fill`, `roll`, `flam`, `strum`, `arp` — and
 * this file holds what landed and what deliberately did not. Two landed, and both
 * as MODIFIERS on a statement that already names what they act on (the language's
 * own preference): `arp` on `chord`, and `repeat` on `arrange`. Three of the other
 * four are arithmetic the app already has, and the test proves each by computing
 * it — a roll is `hold` × `*N`, a strum is an arpeggio on a channel that holds,
 * and a flam is two hits inside one step. The fourth (`fill`) needs a range of
 * steps, which is the one clause this language still has no word for.
 *
 * The other promise is INERTNESS, and this feature has the strongest form of it
 * in the app: neither gesture touches the file format at all. An arpeggio is notes
 * in an order and a repeat is an arrangement, and a song already stores both — so
 * a song using both still writes version 12, byte for byte the file it wrote
 * before the words existed.
 */

/** The song a script made, insisting it parsed. */
function applied(source: string, song: Song = createSong()): Song {
  const result = applyScript(song, source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors[0].message);
  return result.song;
}

/** What a script says, insisting it is refused. */
function refused(source: string, song: Song = createSong()): string {
  const result = applyScript(song, source);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  return result.errors.map((error) => error.message).join(' ');
}

/** The notes of one channel, in row order, up to `rows` steps. */
function column(song: Song, track = 0, rows = 16): (number | null)[] {
  return song.patterns[0].steps.slice(0, rows).map((row) => row[track]?.note ?? null);
}

describe('the arpeggio, as a function of a chord', () => {
  const AM = [69, 72, 76];

  it('plays the tones in order and climbs an octave as they run out', () => {
    expect(arpNotes(AM, { direction: 'up', steps: 3 })).toEqual([69, 72, 76]);
    expect(arpNotes(AM, { direction: 'up', steps: 8 })).toEqual([69, 72, 76, 81, 84, 88, 93, 96]);
    // A seventh chord is four tones, so the octave arrives a step later.
    expect(arpNotes([60, 64, 67, 71], { direction: 'up', steps: 6 })).toEqual([60, 64, 67, 71, 72, 76]);
    expect(arpNotes(AM, { direction: 'up', steps: 1 })).toEqual([69]);
  });

  it('reads downwards as the same run backwards, so a descent starts at the top', () => {
    // Not "the tones in reverse": a 6-step descent of a triad is the 6-step
    // ascent read back, which is what makes it sound like a run coming down
    // rather than a chord played low.
    expect(arpNotes(AM, { direction: 'down', steps: 3 })).toEqual([76, 72, 69]);
    expect(arpNotes(AM, { direction: 'down', steps: 6 })).toEqual([88, 84, 81, 76, 72, 69]);
  });

  it('walks up and back for updown, turning without repeating the turn', () => {
    // `A C E C` is the shape every arpeggiator draws: the top and bottom tones
    // are played once each time round, not twice.
    expect(arpNotes(AM, { direction: 'updown', steps: 4 })).toEqual([69, 72, 76, 72]);
    expect(arpNotes(AM, { direction: 'updown', steps: 8 })).toEqual([69, 72, 76, 72, 81, 84, 88, 84]);
  });

  it('keeps every note inside the range the grid can print', () => {
    // A run that climbs two octaves off a high chord would leave `B-8`; the notes
    // are clamped rather than dropped, for the same reason `writeNote` clamps.
    const high = arpNotes([108, 112, 115], { direction: 'up', steps: 8 });
    expect(high[0]).toBe(108);
    expect(high[2]).toBe(115);
    expect(Math.max(...high)).toBe(MIDI_MAX);
    expect(high.every((midi) => midi <= MIDI_MAX)).toBe(true);
  });

  it('tidies a step count rather than trusting it', () => {
    expect(arpNotes(AM, { direction: 'up', steps: 0 })).toEqual([69]);
    expect(arpNotes(AM, { direction: 'up', steps: 3.4 })).toHaveLength(3);
    expect(arpNotes(AM, { direction: 'up', steps: 10_000 })).toHaveLength(MAX_ARP_STEPS);
    expect(arpNotes([], { direction: 'up', steps: 4 })).toEqual([]);
  });

  it('takes the words a musician would type', () => {
    for (const [word, direction] of [
      ['up', 'up'], ['asc', 'up'], ['ASCENDING', 'up'], [' up ', 'up'],
      ['down', 'down'], ['desc', 'down'], ['descending', 'down'], ['down-ward', 'down'],
      ['updown', 'updown'], ['up and down', 'updown'], ['both', 'updown'],
    ] as const) {
      expect(arpDirectionFromName(word)).toBe(direction);
    }
    for (const bad of ['sideways', '', 'upwards-down', '5']) {
      expect(arpDirectionFromName(bad)).toBeNull();
    }
    expect(ARP_DIRECTIONS).toEqual(['up', 'down', 'updown']);
    // The published aliases are the table the reader uses, not a second copy.
    for (const direction of ARP_DIRECTIONS) {
      expect(ARP_ALIASES[direction][0]).toBe(direction);
      for (const alias of ARP_ALIASES[direction]) expect(arpDirectionFromName(alias)).toBe(direction);
    }
  });
});

describe('the word in a script', () => {
  const SONG = 'tracks 3\nkey A minor\n';

  it('writes the chord one note per step, on the one channel it names', () => {
    const song = applied(`${SONG}chord 0 1 Am ${ARP_WORD} up 8`);
    expect(column(song)).toEqual([69, 72, 76, 81, 84, 88, 93, 96, null, null, null, null, null, null, null, null]);
    // The chord's other notes are NOT spread across the following channels: an
    // arpeggio is one instrument playing the chord, not three playing one note.
    expect(column(song, 1).every((note) => note === null)).toBe(true);
    expect(column(song, 2).every((note) => note === null)).toBe(true);
  });

  it('needs a single channel, where a plain chord needs one per note', () => {
    // The one real difference `arp` makes to the line's arithmetic: two channels
    // are enough to arpeggiate a triad, and not enough to state it.
    const one = applied(`tracks 1\nkey A minor\nchord 0 1 Am ${ARP_WORD} up 4`);
    expect(column(one)).toEqual([69, 72, 76, 81, null, null, null, null, null, null, null, null, null, null, null, null]);
    expect(refused('tracks 2\nkey A minor\nchord 0 1 Am')).toContain('needs 3 channels');
  });

  it('fills one step per tone when the line gives no count', () => {
    expect(column(applied(`${SONG}chord 0 1 Am ${ARP_WORD}`)).slice(0, 4)).toEqual([69, 72, 76, null]);
    // ...and takes the direction as optional too, defaulting to the way up.
    expect(column(applied(`${SONG}chord 0 1 Am ${ARP_WORD} 4`)).slice(0, 4)).toEqual([69, 72, 76, 81]);
    expect(DEFAULT_ARP_DIRECTION).toBe('up');
  });

  it('takes the direction and the count in either order', () => {
    const up = applied(`${SONG}chord 0 1 Am ${ARP_WORD} up 8`);
    const swapped = applied(`${SONG}chord 0 1 Am ${ARP_WORD} 8 up`);
    expect(column(swapped)).toEqual(column(up));
    // ...and the alias a DAW would take means the same thing as the short word.
    expect(column(applied(`${SONG}chord 0 1 Am ${ARP_WORD} asc 6`))).toEqual(column(applied(`${SONG}chord 0 1 Am ${ARP_WORD} up 6`)));
    const descending = applied(`${SONG}chord 0 1 Am ${ARP_WORD} descending 6`);
    expect(column(descending).slice(0, 6)).toEqual([88, 84, 81, 76, 72, 69]);
  });

  it('works for a degree and for a two-token chord name', () => {
    // The modifier is found by SHAPE, so the chord name may still be two tokens.
    const degree = applied(`${SONG}chord 0 1 6 ${ARP_WORD} 4`);
    expect(column(degree).slice(0, 4)).toEqual([77, 81, 84, 89]);
    const named = applied(`${SONG}chord 0 1 C maj7 ${ARP_WORD} up 6`);
    expect(column(named).slice(0, 6)).toEqual([60, 64, 67, 71, 72, 76]);
  });

  it('leaves velocity and articulation alone, like a plain chord does', () => {
    // A generator writes NOTES. How hard each one is hit and how it is played are
    // the cell's business, and the chord statement has never touched them.
    const song = applied(`${SONG}track 1 \"LEAD\" hold 2\nchord 0 1 Am ${ARP_WORD} up 3`);
    const notes = rowNotes(song.patterns[0], 0);
    expect(notes).toHaveLength(1);
    expect(notes[0].velocity).toBe(100);
    expect(notes[0].articulation).toEqual({ slide: false, stutter: 1, grace: 0, bend: 0 });
  });

  it('refuses a run that would leave the pattern, with the rows it needs', () => {
    const message = refused(`${SONG}steps 16\nchord 12 1 Am ${ARP_WORD} up 8`);
    expect(message).toContain('needs rows 12..19');
    expect(message).toContain('the pattern has 16');
    expect(message).toContain('steps N');
    // The same line one row earlier is fine, which is what makes the message's
    // arithmetic checkable by reading it.
    expect(applied(`${SONG}steps 16\nchord 8 1 Am ${ARP_WORD} up 8`)).toBeTruthy();
  });

  it('refuses values it cannot use, without half-writing the run', () => {
    expect(refused(`${SONG}chord 0 1 Am ${ARP_WORD} up 8 down`)).toContain('got 3 values after it');
    expect(refused(`${SONG}chord 0 1 Am ${ARP_WORD} up down`)).toContain('give the direction once');
    expect(refused(`${SONG}chord 0 1 Am ${ARP_WORD} 4 8`)).toContain('give the step count once');
    expect(refused(`${SONG}chord 0 1 Am ${ARP_WORD} sideways 4`)).toContain('neither a direction nor a step count');
    expect(refused(`${SONG}chord 0 1 Am ${ARP_WORD} up 900`)).toContain('neither a direction nor a step count');
    // A refused line leaves the song it was applied to untouched, because a
    // script works on a copy.
    const song = applied(`${SONG}chord 0 1 Am ${ARP_WORD} up 3`);
    refused(`${SONG}chord 0 1 Am ${ARP_WORD} sideways`, song);
    expect(song.patterns[0].steps[0][0].note).toBe(69);
  });
});

describe('the gestures that are not words', () => {
  it('answers a chord line that reaches for one, with what the gesture IS', () => {
    // The roadmap names these, so somebody WILL type one. "is not a chord" would
    // be a true sentence about the wrong thing.
    for (const word of ['strum', 'roll', 'flam', 'fill']) {
      const message = refused(`tracks 3\nchord 0 1 Am ${word}`);
      expect(message).toContain(`chord does not take "${word}"`);
      expect(message).toContain(chordGestureReply(word)!);
      expect(message).not.toContain('is not a chord');
    }
    expect(chordGestureReply('am')).toBeNull();
    expect(chordGestureReply('STRUM')).toContain(ARP_WORD);
  });

  it('a ROLL is a note\'s `*N` with the channel\'s `hold` — the same hits, spaced', () => {
    // The proof, in the app's own arithmetic: `hold 4` makes the note four steps
    // long, and eight hits tile that exactly, so a roll is half a step of hits
    // across a bar. Nothing new was needed for it.
    const step = secondsPerRow(120, 4);
    const fourSteps = noteLength(step, 4);
    const hits = articulationHits({ slide: false, stutter: 8, grace: 0, bend: 0 }, 0);
    expect(hits).toHaveLength(8);
    hits.forEach((hit, i) => {
      expect(hit.at * fourSteps).toBeCloseTo(i * (fourSteps / 8), 10);
      expect(hit.length * fourSteps).toBeCloseTo(fourSteps / 8, 10);
    });
    // At `hold 1` the same eight hits are inside a single step: the app's fastest
    // roll, and what `*8` has meant since it landed.
    expect(noteLength(step, 1)).toBeLessThan(step);
  });

  it('a STRUM is `arp` on a channel that HOLDS, which is why it needs no word', () => {
    // The run's notes ring over each other when the channel holds: note 1 is
    // still sounding when note 2 begins, which is what a hand does and what a
    // grid of steps cannot write as milliseconds.
    const step = secondsPerRow(120, 4);
    const holding = noteLength(step, 4);
    const struck = noteLength(step, 1);
    expect(holding).toBeGreaterThan(step); // the previous note is still ringing
    expect(struck).toBeLessThan(step); // ...and with hold 1 it is an arpeggio
  });

  it('a FLAM is two hits inside one step, because a grace note is a fraction of one', () => {
    const step = secondsPerRow(120, 4);
    const hits = articulationHits({ slide: false, stutter: 2, grace: 0, bend: 0 }, 0);
    expect(hits).toHaveLength(2);
    expect((hits[1].at - hits[0].at) * noteLength(step, 1)).toBeCloseTo(0.45 * step, 10);
    // The hole between the two hits is where a real flam leans: the app can write
    // the pair, and can only approximate the lean by writing the grace note on
    // the step BEFORE, which the language already does with a softer velocity.
    expect(refused('tracks 1\nchord 0 1 Am flam')).toContain('soft hit on the step before');
  });

  it('a FILL is the one left over, and the refusal says what it is waiting on', () => {
    expect(chordGestureReply('fill')).toContain('RANGE of steps');
    // It is not a chord modifier at all: a fill is hits over a range of steps,
    // and neither `chord` nor any other statement names one yet.
    expect(SCRIPT_KEYWORDS).not.toContain('fill');
    expect(SCRIPT_KEYWORDS).not.toContain('roll');
  });
});

describe('repeating a section', () => {
  const FORM = 'tracks 2\nsection VERSE 1 2\nsection CHORUS 1\n';

  it('plays the name before it as many times as it says IN ALL', () => {
    const song = applied(`${FORM}arrange VERSE CHORUS ${REPEAT_WORD} 3 VERSE`);
    // VERSE is bars 1,2; CHORUS is bar 1 — and the repeat expands before anything
    // else sees the line, which is what makes a plain `order` line equivalent.
    expect(song.order).toEqual([1, 2, 1, 1, 1, 1, 2]);
    // The arrangement claim carries the names it was built from, repeats and all:
    // it is a CLAIM about the order, and the order is what plays.
    expect(song.arrangement).toEqual(['VERSE', 'CHORUS', 'CHORUS', 'CHORUS', 'VERSE']);
  });

  it('is sugar over naming the section twice, and writes exactly that', () => {
    const repeated = applied(`${FORM}arrange VERSE CHORUS ${REPEAT_WORD} 4`);
    const typed = applied(`${FORM}arrange VERSE CHORUS CHORUS CHORUS CHORUS`);
    expect(repeated.order).toEqual(typed.order);
    expect(repeated.arrangement).toEqual(typed.arrangement);
    expect(songToScript(repeated)).toBe(songToScript(typed));
  });

  it('leaves the statement alone when it is absent', () => {
    // VERSE is bars 1,2 and CHORUS is bar 1, so the three names are five bars.
    const song = applied(`${FORM}arrange VERSE CHORUS VERSE`);
    expect(song.order).toEqual([1, 2, 1, 1, 2]);
    expect(song.arrangement).toEqual(['VERSE', 'CHORUS', 'VERSE']);
  });

  it('refuses a count that means nothing, and a repeat with nothing to repeat', () => {
    expect(refused(`${FORM}arrange ${REPEAT_WORD} 3`)).toContain('write the name first');
    expect(refused(`${FORM}arrange VERSE ${REPEAT_WORD}`)).toContain('how many times');
    expect(refused(`${FORM}arrange VERSE ${REPEAT_WORD} twice`)).toContain('how many times');
    expect(refused(`${FORM}arrange VERSE ${REPEAT_WORD} 0`)).toContain('how many times');
    expect(refused(`${FORM}arrange VERSE ${REPEAT_WORD} 99`)).toContain('how many times');
    // `repeat 1` is refused for the same reason a cell refuses `*1`: a count that
    // means nothing should not look like a count that did something.
    expect(refused(`${FORM}arrange VERSE ${REPEAT_WORD} 1`)).toContain('just the name on its own');
    expect(refused(`${FORM}arrange VERSE ${REPEAT_WORD} 2 ${REPEAT_WORD} 2`)).toContain('give one count');
    expect(refused(`${FORM}arrange VERSE ${REPEAT_WORD} 2 MISSING`)).toContain('does not have');
  });

  it('still refuses an arrangement longer than a song can play', () => {
    // CHORUS is one bar, so 64 of them is exactly the ceiling.
    const song = applied(`${FORM}arrange CHORUS ${REPEAT_WORD} ${MAX_REPEAT}`);
    expect(song.order).toHaveLength(MAX_ORDER);
    // One bar more than the ceiling: the existing message, from the existing
    // check, because a repeat EXPANDS into an order rather than becoming one.
    expect(refused(`${FORM}arrange CHORUS ${REPEAT_WORD} ${MAX_REPEAT} CHORUS`)).toContain(`${MAX_ORDER}`);
    expect(MIN_REPEAT).toBe(2);
    expect(MAX_REPEAT).toBe(MAX_ORDER);
  });

  it('round-trips through both file formats', () => {
    const song = applied(`${FORM}arrange VERSE CHORUS ${REPEAT_WORD} 3`);
    const back = songFromJson(songToJson(song));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.song.order).toEqual(song.order);
    expect(back.song.arrangement).toEqual(song.arrangement);
    expect(applied(songToScript(song), createSong()).order).toEqual(song.order);
  });

  it('goes back to a single bar when a script starts a new song', () => {
    const song = applied(`${FORM}arrange VERSE ${REPEAT_WORD} 4`);
    const fresh = applied('new\ntracks 2', song);
    expect(fresh.order).toEqual([1]);
    expect(fresh.arrangement).toEqual([]);
  });
});

describe('each gesture spends the words it needs, and no more', () => {
  it('keeps `repeat` a VALUE, because a value was all it ever needed', () => {
    // The roadmap's budget of new verbs reserved `arp`; `repeat` never needed one,
    // because it is a VALUE on an `arrange` line the way `bars` is a value on an
    // `automate` line. The ARP page later PROMOTED `arp` itself to a word — a lone
    // modifier cannot store the dials a page draws and reopen them — so `repeat`
    // is the one gesture that stayed a value.
    expect(SCRIPT_KEYWORDS).not.toContain(REPEAT_WORD);
    const caps = scriptCapabilities();
    expect(caps.commands.some((row) => row.word === REPEAT_WORD)).toBe(false);
    // And `arp` IS a command word now, with a row of its own.
    expect(SCRIPT_KEYWORDS).toContain(ARP_WORD);
    expect(caps.commands.some((row) => row.word === ARP_WORD)).toBe(true);
  });

  it('publishes what a tool has to know before writing one', () => {
    const caps = scriptCapabilities();
    expect(caps.scriptVersion).toBeGreaterThanOrEqual(11);
    expect(caps.versionNotes.find((entry) => entry.version === 11)?.note).toContain(ARP_WORD);
    expect(caps.vocabulary.arpDirections.map((entry) => entry.id)).toEqual([...ARP_DIRECTIONS]);
    expect(caps.vocabulary.arpDirections.find((entry) => entry.id === 'down')?.aliases).toContain('descending');
    expect(caps.limits.arpSteps).toEqual({ min: MIN_ARP_STEPS, max: MAX_ARP_STEPS });
    expect(caps.limits.arpSteps.max).toBe(MAX_ROWS);
    expect(caps.limits.sections.repeat).toEqual({ min: MIN_REPEAT, max: MAX_REPEAT });
  });

  it('leaves the cheat sheet the length it was', () => {
    // The chord line gained one word; no line may pass the width the panel's
    // paste box leaves, which is what the quick reference's own test measures.
    expect(scriptCapabilities().scriptVersion).toBeGreaterThan(10);
  });
});

describe('the file does not move, which is the point', () => {
  it('writes version 12 for a song whose only new thing is an arpeggio', () => {
    // An arpeggio is notes in an order, which is what a grid already is: no
    // version is declared and no key appears, so the file is the file the same
    // notes written out by hand would have been.
    const song = applied('tracks 1\nkey A minor\nchord 0 1 Am arp up 8');
    const raw = JSON.parse(songToJson(song)) as Record<string, unknown>;
    expect(SONG_FILE_VERSION).toBe(12);
    expect(SONG_FILE_VERSION).toBeLessThanOrEqual(SONG_FILE_VERSION_MAX);
    expect(raw.version).toBe(SONG_FILE_VERSION);
    expect(JSON.stringify(raw)).not.toContain(ARP_WORD);
    expect(JSON.stringify(raw)).not.toContain(REPEAT_WORD);
  });

  it('does not move the version a FORM already declares', () => {
    // A song with sections is version 18 for the form's own reasons, and a
    // `repeat` is an arrangement rather than a new shape of one — so the two
    // files differ only in the order and the names, which they already had.
    const plain = applied('tracks 2\nsection VERSE 1 2\nsection CHORUS 1\narrange VERSE CHORUS CHORUS CHORUS');
    const compact = applied('tracks 2\nsection VERSE 1 2\nsection CHORUS 1\narrange VERSE CHORUS repeat 3');
    const raw = JSON.parse(songToJson(compact)) as Record<string, unknown>;
    expect(raw.version).toBe(JSON.parse(songToJson(plain)).version);
    expect(JSON.stringify(raw)).not.toContain(REPEAT_WORD);
    expect(songToJson(compact)).toBe(songToJson(plain));
  });

  it('writes the run out rather than spelling it, because a writer writes the song', () => {
    const song = applied('tracks 1\nkey A minor\nchord 0 1 Am arp up 4');
    const text = songToScript(song);
    expect(text).not.toContain(`${ARP_WORD} `);
    expect(text).toContain('A-4');
    expect(column(applied(text, createSong())).slice(0, 4)).toEqual([69, 72, 76, 81]);
  });

  it('hands the same cells to a hand as an arp line would', () => {
    const arp = applied('tracks 1\nkey A minor\nchord 0 1 Am arp up 4');
    const typed = applied('tracks 1\nkey A minor\nA-4\nC-5\nE-5\nA-5');
    expect(column(arp).slice(0, 4)).toEqual(column(typed).slice(0, 4));
    expect(songToJson(arp)).toBe(songToJson(typed));
  });
});
