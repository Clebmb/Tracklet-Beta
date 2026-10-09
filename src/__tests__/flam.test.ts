import { describe, expect, it } from 'vitest';

import {
  articulationHits,
  articulationLabel,
  articulationProblem,
  articulationText,
  createSong,
  GRACE_CHAR,
  MAX_GRACE,
  NO_ARTICULATION,
  parseArticulation,
} from '../model';
import { applyScript } from '../model/script';
import { songFromJson, songToJson, songToScript } from '../model/songfile';

/**
 * The flam and the drag: grace hit(s) leaning into the beat.
 *
 * One grace hit is a FLAM, two a DRAG. The graces sit just BEFORE the beat and
 * the main hit stays ON it — a flam leans into the beat, it does not leave it —
 * which is why a hit's `at` is allowed to be negative. Written `!`/`!!` in a cell,
 * or `flam`/`drag` as a `note`/`drum` line's value.
 */

function applied(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`expected a clean script, got: ${result.errors.map((e) => e.message).join(' / ')}`);
  return result;
}

describe('reading the gesture', () => {
  it('reads ! as a flam and !! as a drag, with the words too', () => {
    expect(parseArticulation(GRACE_CHAR)).toEqual({ slide: false, stutter: 1, grace: 1, bend: 0 });
    expect(parseArticulation(`${GRACE_CHAR}${GRACE_CHAR}`)).toEqual({ slide: false, stutter: 1, grace: 2, bend: 0 });
    expect(parseArticulation('flam')).toEqual({ slide: false, stutter: 1, grace: 1, bend: 0 });
    expect(parseArticulation('drag')).toEqual({ slide: false, stutter: 1, grace: 2, bend: 0 });
    expect(parseArticulation(`>${GRACE_CHAR}`)).toEqual({ slide: true, stutter: 1, grace: 1, bend: 0 });
    expect(GRACE_CHAR).toBe('!');
    expect(MAX_GRACE).toBe(2);
  });

  it('refuses three graces, and a grace mixed with a stutter', () => {
    expect(parseArticulation(`${GRACE_CHAR}${GRACE_CHAR}${GRACE_CHAR}`)).toBeNull();
    expect(parseArticulation(`*3${GRACE_CHAR}`)).toBeNull();
    expect(articulationProblem(`${GRACE_CHAR}${GRACE_CHAR}${GRACE_CHAR}`)).toContain('at most twice');
    expect(articulationProblem(`*3${GRACE_CHAR}`)).toContain('cannot both roll and flam');
  });

  it('writes and names the gesture', () => {
    expect(articulationText({ slide: false, stutter: 1, grace: 1, bend: 0 })).toBe('!');
    expect(articulationText({ slide: false, stutter: 1, grace: 2, bend: 0 })).toBe('!!');
    expect(articulationText({ slide: true, stutter: 1, grace: 2, bend: 0 })).toBe('>!!');
    expect(articulationLabel({ slide: false, stutter: 1, grace: 1, bend: 0 })).toBe('FLAM');
    expect(articulationLabel({ slide: false, stutter: 1, grace: 2, bend: 0 })).toBe('DRAG');
    expect(articulationText(NO_ARTICULATION)).toBe('');
  });
});

describe('where the hits fall', () => {
  it('is one hit at the start for a plain note', () => {
    expect(articulationHits(NO_ARTICULATION, 40)).toEqual([{ at: 0, length: 1, glide: 40, bend: 0 }]);
  });

  it('puts a flam s grace BEFORE the beat and the main hit on it', () => {
    const hits = articulationHits({ slide: false, stutter: 1, grace: 1, bend: 0 }, 0);
    expect(hits).toHaveLength(2);
    expect(hits[0].at).toBeLessThan(0); // the grace
    expect(hits[0].length).toBeGreaterThan(0);
    expect(hits[1]).toEqual({ at: 0, length: 1, glide: 0, bend: 0 }); // the main hit, on the beat
  });

  it('puts a drag s TWO graces before the beat, oldest first', () => {
    const hits = articulationHits({ slide: false, stutter: 1, grace: 2, bend: 0 }, 0);
    expect(hits).toHaveLength(3);
    expect(hits[0].at).toBeLessThan(hits[1].at);
    expect(hits[1].at).toBeLessThan(0);
    expect(hits[2].at).toBe(0);
  });

  it('lets a flam SLIDE into the beat — the main hit, not the grace, arrives', () => {
    const hits = articulationHits({ slide: true, stutter: 1, grace: 1, bend: 0 }, 0);
    expect(hits[hits.length - 1].glide).toBe(100);
    expect(hits[0].glide).toBe(0);
  });
});

// --- the language and the files --------------------------------------------

describe('a flam in a script and a file', () => {
  it('reads ! and !! off a grid cell', () => {
    const song = applied('tracks 4\nkick! . . .\n. kick!! . .').song;
    expect(song.patterns[0].steps[0][0]).toMatchObject({ drum: 'kick', grace: 1 });
    expect(song.patterns[0].steps[1][1]).toMatchObject({ drum: 'kick', grace: 2 });
  });

  it('reads the words on a drum line', () => {
    const song = applied('tracks 4\ndrum 0 1 kick flam\ndrum 2 1 snare drag').song;
    expect(song.patterns[0].steps[0][0]).toMatchObject({ drum: 'kick', grace: 1 });
    expect(song.patterns[0].steps[2][0]).toMatchObject({ drum: 'snare', grace: 2 });
  });

  it('refuses a gesture it cannot play, in words', () => {
    const bad = applyScript(createSong(), 'tracks 4\nkick!!! . . .');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0].message).toContain('at most twice');
  });

  it('round-trips through both formats', () => {
    const song = applied('tracks 4\nkick! . . .').song;
    const json = songToJson(song);
    expect(json).toContain('"!"');
    const parsed = songFromJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.patterns[0].steps[0][0].grace).toBe(1);

    const script = songToScript(song);
    expect(script).toContain('kick!');
    expect(songFromJson(songToJson(song)).ok).toBe(true);
  });

  it('leaves a plain note out of the written file, so old songs are byte-identical', () => {
    const song = applied('tracks 4\nkick . . .').song;
    expect(songToJson(song)).not.toContain('"!"');
    expect(songToScript(song)).not.toContain('!');
  });
});
