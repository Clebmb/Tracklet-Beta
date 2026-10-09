import { describe, expect, it } from 'vitest';

import { applyScript, createSong } from '../model';
import { GENRES } from '../model/genre';
import { fixture, goldenOf, renderPlan } from './goldenPlan';

/**
 * A golden hash for every STARTER — G7.1 of `ROADMAP-GENRES.md`.
 *
 * `golden.test.ts` freezes two hand-written songs: the language's own example,
 * and one that uses the whole surface at once. That protects the FLOOR and the
 * CEILING, but it says nothing about the genre shelf — and the shelf is where
 * `ROADMAP-GENRES.md` stakes its claim, that each of these genres is reachable
 * from the oscillator up with no samples. Every starter is a song too, so freezing
 * all of them turns "did adding this knob change rock?" from a listening test into
 * a build failure.
 *
 * ── Why per-starter, and not one hash for the shelf ─────────────────────────
 * One hash over all nine would tell you a starter moved and not which one. A hash
 * each means the failure names the genre, which is the whole difference between a
 * tripwire you can act on and one you can only stare at. The map keys are checked
 * against `GENRES` in BOTH directions, so a tenth starter cannot be added without
 * recording it here, and a retired one cannot leave a stale row behind.
 *
 * ── What moves a starter's hash ─────────────────────────────────────────────
 * The same things that move a fixture's, through the same `goldenPlan.ts`: the
 * saved file, the render length, every channel patch, and every channel setting
 * named EXPLICITLY (so a new effect with a non-zero default moves all nine at
 * once — which is precisely the accident worth catching). A change purely inside
 * an oscillator or the room does not, because the DSP needs a browser and is not
 * run here. When a hash below really should change, paste the new one and say why
 * in the commit: that edit IS the claim.
 */
const STARTER_GOLDEN: Record<string, string> = {
  house: '0cac5c800ac53e6c70',
  lofi: '814bacf395c64da61b',
  ballad: 'a6592c7d267c633ba8',
  rock: 'c76625c130f13fb3ba',
  emo: '1f04636b6802585811',
  vaporwave: 'd8eeb05ae5db88d7e3',
  synthwave: 'f2d50f41af4b17b5d0',
  shoegaze: '17948d21c3c9b72181',
  dnb: 'f6b7ef29e4a1bc0536',
};

describe('the golden render plan of every starter', () => {
  it('names a hash for exactly the shelf the app ships', () => {
    // Both directions, so neither a new starter without a recorded hash nor a
    // recorded hash without a starter can pass.
    expect(Object.keys(STARTER_GOLDEN).sort()).toEqual(GENRES.map((genre) => genre.id).sort());
  });

  it('is unmoved for every starter, one hash each', () => {
    const moved: string[] = [];
    for (const genre of GENRES) {
      const got = goldenOf(fixture(genre.script));
      if (got !== STARTER_GOLDEN[genre.id]) moved.push(`${genre.id}: ${STARTER_GOLDEN[genre.id]} -> ${got}`);
    }
    // Reported together rather than one failing assertion at a time, so a phase
    // that moved the whole shelf says so in one run.
    expect(moved).toEqual([]);
  });

  it('is unmoved by a trip through the script that wrote each starter', () => {
    // A starter is written AS a script and APPLIED to an empty song; applying that
    // same script again must be a fixed point, or a starter would grow every time
    // it was pasted. (The file round trip is already covered for the fixtures;
    // here the point is that every starter is a well-behaved script.)
    for (const genre of GENRES) {
      const song = fixture(genre.script);
      const again = applyScript(song, genre.script);
      expect(again.ok, `${genre.id} does not re-apply`).toBe(true);
      if (!again.ok) continue;
      expect(goldenOf(again.song), genre.id).toBe(STARTER_GOLDEN[genre.id]);
    }
  });

  it('would move if a starter turned an effect on, because the plan names them', () => {
    // A guard on the guard: if the channel settings were left out of the plan, a
    // phase could change how they sound and freeze nothing. One starter is enough
    // to prove the wiring; the shared helper makes it true of all of them.
    const rock = applyScript(createSong(), GENRES.find((genre) => genre.id === 'rock')!.script);
    expect(rock.ok).toBe(true);
    if (!rock.ok) return;
    const withDrive = applyScript(rock.song, 'track 1 drive 60');
    expect(withDrive.ok).toBe(true);
    if (!withDrive.ok) return;
    expect(goldenOf(withDrive.song)).not.toBe(goldenOf(rock.song));
  });

  it('freezes a shelf that is really nine different records, not nine tempos', () => {
    // A guard on the shelf, in the frozen bytes: nine distinct render plans. Two
    // starters that hashed alike would mean two starters that ARE alike, which is
    // the one thing the shelf exists not to be.
    const plans = new Set(GENRES.map((genre) => renderPlan(fixture(genre.script))));
    expect(plans.size).toBe(GENRES.length);
  });
});
