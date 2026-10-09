import { describe, expect, it } from 'vitest';

import { renderSeconds } from '../audio/render';
import {
  applyScript,
  createSong,
  DEFAULT_EFFECT,
  SCRIPT_EXAMPLE,
  songFromJson,
  songToJson,
  songToScript,
  TRACK_EFFECTS,
} from '../model';
import { fixture, goldenOf, renderPlan } from './goldenPlan';

/**
 * The golden hash — the machine that enforces "inert by default".
 *
 * Every later phase has to prove it did not change how a song that says nothing
 * new comes out. Prose cannot do that, and neither can a snapshot a person has to
 * eyeball; a hash can. Each fixture below is a song, and the hash is taken over
 * **everything the engine is handed** to play it:
 *
 * - the song file the app would write for it — so the format, every field the
 *   writer omits, and every field it carries are covered;
 * - how long the render is (`renderSeconds`, which walks the tempo map, the swing
 *   and the tail exactly as the offline renderer does);
 * - the PATCH of every channel — voice plus stack, at layer level, which is what
 *   `buildNote` is actually given.
 *
 * ── What this does NOT cover, honestly ──────────────────────────────────────
 * The samples. `renderSongToPcm` needs an `OfflineAudioContext`, which a headless
 * test runner does not have (see `canRender()`), so the DSP is not run here. What
 * is frozen is the input to it: any change to the model, the file writer, the
 * timing arithmetic or the patch that would move a single sample shows up as a
 * different hash, while a change purely inside the oscillators or the room does
 * not. Live and offline share `synth.ts`/`chain.ts`/`room.ts` and are compared in
 * `F1 → EXPORT AUDIO`; this is the tripwire for everything above that line.
 *
 * ── When a hash changes, that is the point ──────────────────────────────────
 * If a change is really meant to alter how these songs sound, the new hash is
 * pasted in below and the reason goes in the commit: that edit is the claim being
 * made. If it is not what you meant, the hash has just said which of the three
 * inputs above moved.
 */

// The plan and its digest live in `goldenPlan.ts`, shared with `starterGolden.test.ts`,
// so the two tripwires freeze exactly the same things. See that file for what a plan
// covers and — honestly — what it does not (the DSP itself, which needs a browser).

/** The published example song: the language's own "nothing new here". */
const PLAIN = fixture(SCRIPT_EXAMPLE);

/**
 * A fixture that uses the whole surface at once, on purpose.
 *
 * The plain song above protects the floor — the common case, and what an old file
 * is. This one protects the ceiling: a stack of layers, a send, a tempo map, a
 * feel, a temperament, chords, velocity, pan, glide and a two-bar order in one
 * song. A phase that quietly changes what a layer costs, how a tempo map is
 * walked, or which fields a stacked file writes moves this hash and leaves the
 * plain one alone — which is exactly the signal worth having.
 */
const STACKED_SCRIPT = `new
song "GOLDEN FIXTURE"
key A minor
tempo 128
tuning just
groove shuffle
swing 20
tracks 4

track 1 "LEAD" voice lead level 75 pan L20 glide 25
layer 1 2 wave saw octave 0 detune -9 gain 55
layer 1 3 wave saw octave 0 detune 9  gain 45
track 2 "BASS" voice bass level 70
track 3 "PAD" voice pad hold 8 level 45 verb 60
track 4 "HAT" voice hat level 40 vibrato 20

pattern 1 "A"
A-4 A-2 E-4 C-6
.    .   .   .
C-5~60 . E-4 C-6
.    .   .   .
E-5 A-2 A-4 C-6
.    .   .   .
G-5 A-2 C-5 C-6
.    .   .   .

pattern 2 "B"
F-4 E-2 F-4 C-6
.   .   .   .
chord 4 1 Am
chord 8 1 F
chord 12 1 C

tempo 140 at 2
order 1 2 1 1
`;

const STACKED = fixture(STACKED_SCRIPT);

/**
 * A fixture whose beat is a MACHINE rather than a channel.
 *
 * The third thing the plan freezes: an instrument that is not a track at all.
 * The machine block in `goldenPlan.ts` names its pads, its rows and where those
 * rows land in the song's clock, so a change to how a pad is patched, how the
 * grid is laid out, or how the machine sits in the mix moves THIS hash while the
 * two above stay put — which is exactly the signal worth having for a part that
 * has no channel to hang it on.
 */
const MACHINE_SCRIPT = `new
song "GOLDEN MACHINE"
tempo 124
tracks 2

track 1 "LEAD" voice lead level 60
track 2 "BASS" voice bass level 70

machine steps 16 beat 4 swing 25 level 85 pan 15 duck 30 verb 20
machine drive 30

pad 1 "KICK" voice kick level 100 pattern "9...9...9...9..."
pad 2 "SNARE" voice snare pattern "....9.......9..."
pad 3 "HAT" voice hat level 60 pattern "9.9.9.9.9.9.9.9."
pad 5 "TOM" wave membrane tune -4 pattern "........9..9...."

pattern 1 "A"
C-2 .
.   E-2
G-2 .
.   .

order 1
`;

const MACHINE = fixture(MACHINE_SCRIPT);

/**
 * The frozen hashes. An edit here is a claim about what changed, so say why.
 *
 * 425596f7b30abb24b0 / 49a95bf32a38281b96 — re-recorded when the tenth channel
 * effect (`vinyl`, G3.4 and the last of the character effects) landed, one turn
 * after the ninth (`radio`). Neither the songs nor a single default changed: the
 * PLAN did, gaining `vinyl` in the `channels` block above. That block exists
 * precisely so this is the outcome — a setting named explicitly either matches
 * what it was or moves the hash, and adding it is a claim about the plan rather
 * than a change to what the fixtures sound like.
 *
 * The pairs before it were dddc72385cc105dfaf / 461899bc038b9dc547 (`radio`),
 * a80c21838221fcb9e4 / ebb77b276be4a0b0d0 (`tape`),
 * 77da35e9469067c21d / ea7894fadf7ff37e01 (`cab`) and
 * 9cb42140d689962537 / ec9af0a225c5c89172 (Phase 2, when the whole `channels`
 * block arrived), each re-recorded for the same reason.
 *
 * Three re-records in three turns is worth a word, because it looks like churn
 * and is the opposite: the block is a list of every channel setting, so an
 * effect that is ADDED moves it whether or not the fixtures use it. That is the
 * point — the day a default moves, this catches it — and the cost is one line
 * here per effect.
 */
const GOLDEN = {
  plain: '425596f7b30abb24b0',
  stacked: '49a95bf32a38281b96',
  // New with the drum machine (Phase P4): the one fixture with a machine. The
  // two above did not move, which is the inertness claim — a song with no machine
  // hashes the exact string it hashed before.
  //
  // Re-recorded twice since, both times for the PLAN rather than the song: once
  // when `describeMachine` gained each pad's `tune` (P6), and once when the plan
  // gained the per-pad `strips` — the fader and place each pad's notes are handed
  // now that a pad has nodes of its own (P8). Neither moved the two fixtures
  // above, which is what "a change to a machine does not touch a song that has
  // none" means in frozen bytes.
  //
  // Re-recorded once more when the machine gained BARS and an ORDER (P8): the
  // plan's `describe` now carries each pad's bar count, order and per-bar rows.
  machine: 'daed92daf906f2a096',
};

describe('the golden render plan', () => {
  it('is unmoved for the published example song', () => {
    expect(goldenOf(PLAIN)).toBe(GOLDEN.plain);
  });

  it('is unmoved for the song that uses the whole surface', () => {
    expect(goldenOf(STACKED)).toBe(GOLDEN.stacked);
  });

  it('is unmoved for the song whose beat is a machine', () => {
    expect(goldenOf(MACHINE)).toBe(GOLDEN.machine);
  });

  it('does not hash a machine at all when there is none', () => {
    // The inertness half of the machine block, visible in the plan: a song with
    // no machine carries no machine key, so every earlier fixture hashes the same.
    expect(renderPlan(PLAIN)).not.toContain('"machine"');
    expect(renderPlan(MACHINE)).toContain('"machine"');
  });

  it('freezes every channel effect OFF, which is what an old song is', () => {
    // The inert half of Phase 2, in the frozen bytes: a fixture written before
    // effects existed says nothing about them, and plays with all six off.
    for (const song of [PLAIN, STACKED]) {
      for (const track of song.tracks) {
        for (const effect of TRACK_EFFECTS) expect(track[effect.id]).toBe(DEFAULT_EFFECT);
      }
      expect(songToJson(song)).not.toContain('drive');
    }
  });

  it('would move if an effect were on, because the plan names them', () => {
    // A guard on the plan itself: if the effect fields were left out of the hash,
    // a change to how they sound would freeze nothing at all.
    const withDrive = applyScript(PLAIN, 'track 1 drive 60');
    expect(withDrive.ok).toBe(true);
    if (!withDrive.ok) return;
    expect(goldenOf(withDrive.song)).not.toBe(goldenOf(PLAIN));
  });

  it('hashes a plain song with no layers and a stacked one with them', () => {
    // Both halves of the inertness promise, visible in the frozen bytes: a song
    // that says nothing about layers writes no layers, and one that stacks them
    // really carries them — in the newer file version, so an older build refuses
    // it rather than opening it with half its sound.
    const plain = songToJson(PLAIN);
    const stacked = songToJson(STACKED);
    expect(plain).not.toContain('"stack"');
    expect(plain).toContain('"version": 12');
    expect(stacked).toContain('"stack"');
    expect(stacked).toContain('"version": 13');
  });

  it('is unmoved by a trip through the file format', () => {
    // Saving and opening is the one journey every song makes, and both formats
    // are checked: the `.json` a program reads, and the script a person reads.
    for (const song of [PLAIN, STACKED]) {
      const parsed = songFromJson(songToJson(song));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(goldenOf(parsed.song)).toBe(goldenOf(song));

      const written = applyScript(createSong(), songToScript(song));
      expect(written.ok).toBe(true);
      if (!written.ok) return;
      expect(goldenOf(written.song)).toBe(goldenOf(song));
    }
  });

  it('is a fixed point of the script that wrote each fixture', () => {
    // Applying a script to the song it already produced changes nothing. Worth
    // asserting because "a script describes the WHOLE song" is what makes a
    // pasted script predictable, and an accident that broke it — a stack appended
    // instead of replaced, a pattern grown rather than reset — would otherwise
    // show up only as a song that gets bigger every time it is pasted.
    for (const [song, source] of [[PLAIN, SCRIPT_EXAMPLE], [STACKED, STACKED_SCRIPT], [MACHINE, MACHINE_SCRIPT]] as const) {
      const again = applyScript(song, source);
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(goldenOf(again.song)).toBe(goldenOf(song));
    }
  });

  it('has fixtures worth freezing', () => {
    // A guard on the guard: a fixture that lost its notes or its layers would
    // still hash, and the tests above would still pass, while protecting nothing.
    const plan = JSON.parse(renderPlan(STACKED)) as { patches: { layers: unknown[] }[] };
    expect(plan.patches[0].layers.length).toBe(3);
    expect(plan.patches[1].layers.length).toBe(1);
    expect(renderSeconds(PLAIN, { repeats: 1 })).toBeGreaterThan(1);
  });
});
