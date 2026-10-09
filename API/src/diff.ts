/**
 * diff — the inverse of the edit engine: two songs in, the edits between them out.
 *
 * `applyEdits` goes one way (a song and a list of changes become a new song). This
 * goes the other, and it is written as the exact inverse rather than as a pretty
 * report for one reason: the output is a list of edits in the SAME vocabulary, so
 * a diff is not merely something a person reads — it is something an agent can
 * REPLAY. Ask what changed between two saves, and you get back the list you would
 * have sent to `song.edit` to make the second one, which `library.update` can then
 * apply to a file.
 *
 * ── Verified, not asserted ───────────────────────────────────────────────────
 *
 * The hard claim is "applying these edits to `before` produces `after`", and it is
 * exactly the kind of claim that goes quietly wrong. So this module CHECKS it: it
 * applies the edits it just computed to a copy of `before`, serializes both that
 * and `after` through the song's own writer, and compares. `verified` says whether
 * that held, and it is a fact a test can hold the code to rather than a promise.
 *
 * ── Honest about what it cannot express ──────────────────────────────────────
 *
 * The edit vocabulary is deliberately small, and a song has more in it than the
 * vocabulary writes: channels and patterns cannot be added or removed, a pattern
 * cannot be renamed, and the tempo map, the progression and the tuning are not
 * editable at all. (The ARRANGER's automation lanes ARE editable, as
 * `automation.set` and `automation.clear` by position.) When a diff meets one of
 * those it does not guess
 * or drop it silently —
 * `notes` says, in a sentence, what changed and why it is not in the list. So a
 * caller can tell "nothing changed" from "something changed that I cannot send",
 * which is the distinction that keeps a partial diff from looking complete.
 */

import {
  arrangementBars,
  cellNotes,
  defaultPad,
  emptyCell,
  INITIAL_PADS,
  keyName,
  machineBarCount,
  machineBarRows,
  patternRows,
  resizeRow,
  sameBusName,
  sameLane,
  sameScene,
  songToJson,
  TRACK_EFFECTS,
  VOICE_PARAMS,
  type ArpSettings,
  type AutomationLane,
  type Bus,
  type Cell,
  type DrumMachine,
  type Scene,
  type Section,
  type Song,
} from '../../src/model';
import type { ApiInput } from './input';
import { applyEdits, type EditChange } from './edits';

/** Everything a diff found: the replayable edits, the log, and the caveats. */
export interface SongDiff {
  /** True when the two songs serialize identically — nothing changed at all. */
  identical: boolean;
  /** How many edits are in the list. */
  changed: number;
  /** The edits, ready to hand to `song.edit` or `library.update`. */
  edits: ApiInput[];
  /** The change log those edits produce when applied to `before`. */
  changes: EditChange[];
  /** What changed that this vocabulary cannot express, one sentence each. */
  notes: string[];
  /** True when applying `edits` to `before` really does produce `after`. */
  verified: boolean;
}

/** The fields compared as a block, because there is no edit that sets any of them. */
const OPAQUE_FIELDS = [
  'tempoMap',
  'progression',
  'tuning',
] as const;

/** A song as text, or null if it cannot be written — used for the comparisons. */
function serialized(song: Song): string | null {
  try {
    return songToJson(song, { volume: null });
  } catch {
    return null;
  }
}

/** Do two cells hold the same music — notes, drum, and the per-note feel? */
function sameCell(a: Cell, b: Cell): boolean {
  if (a.drum !== b.drum) return false;
  if (a.velocity !== b.velocity || a.slide !== b.slide || a.stutter !== b.stutter) return false;
  const an = cellNotes(a);
  const bn = cellNotes(b);
  return an.length === bn.length && an.every((note, index) => note === bn[index]);
}

/**
 * The form's edits: a `section.set` per section that is new or moved, a
 * `section.clear` per section that went away.
 *
 * A section is defined by NAME, so a change to one is always one `section.set`
 * whatever moved — its bars or the machine bar it plays. Removed sections go
 * first, so a name that was renamed does not leave the old one behind.
 */
function sectionEdits(before: readonly Section[], after: readonly Section[], edits: ApiInput[], notes: string[]): void {
  for (const section of before) {
    if (!after.some((one) => one.name === section.name)) {
      edits.push({ op: 'section.clear', name: section.name });
    }
  }
  for (const section of after) {
    const was = before.find((one) => one.name === section.name);
    const sameBars = was !== undefined && was.bars.length === section.bars.length && was.bars.every((bar, i) => bar === section.bars[i]);
    const sameMachine = (was?.machineBar ?? null) === (section.machineBar ?? null);
    if (was && sameBars && sameMachine) continue;
    const edit: ApiInput = { op: 'section.set', name: section.name, bars: [...section.bars] };
    if (section.machineBar != null) edit.machine = section.machineBar;
    edits.push(edit);
  }
  // A section can be REPLACED by name but not MOVED in the list, and the file
  // writes them in the order they were defined — so a pure reshuffle cannot be
  // reached, and saying so is better than a diff that silently is not.
  const kept = before.map((one) => one.name).filter((name) => after.some((one) => one.name === name));
  const now = after.map((one) => one.name).filter((name) => before.some((one) => one.name === name));
  if (kept.join(' ') !== now.join(' ')) {
    notes.push('the order of the sections changed; this vocabulary defines a section by name and cannot reorder them.');
  }
}

/**
 * The groups' edits: one `bus.set` per group that is new or has moved its fader.
 *
 * A group is defined by NAME, so a change to one is always one `bus.set`. A group
 * that went away cannot be reached — the vocabulary defines and moves a group but
 * never removes one, because nothing on the MIXER page removes a group either — so
 * the loss is noted rather than approximated.
 */
function busEdits(before: readonly Bus[], after: readonly Bus[], edits: ApiInput[], notes: string[]): void {
  for (const bus of after) {
    const was = before.find((one) => sameBusName(one.name, bus.name));
    if (!was || was.level !== bus.level) {
      edits.push({ op: 'bus.set', name: bus.name, level: bus.level });
    }
  }
  for (const bus of before) {
    if (!after.some((one) => sameBusName(one.name, bus.name))) {
      notes.push(`the group "${bus.name}" was removed; this vocabulary defines and moves a group but cannot remove one.`);
    }
  }
}

/**
 * The LIVE page's scenes: one `scene.set` per scene that is new or changed, a
 * `scene.clear` per scene that went away.
 *
 * A scene is defined by NAME, so a change to one is always one `scene.set` — its
 * clips and its machine bar travel together. Removed scenes go first, so a name
 * that was renamed does not leave the old row behind. A pure REORDER cannot be
 * reached (the file writes scenes in the order they were defined), so it is noted
 * rather than written as a wrong list.
 */
function sceneEdits(before: readonly Scene[], after: readonly Scene[], edits: ApiInput[], notes: string[]): void {
  for (const scene of before) {
    if (!after.some((one) => one.name === scene.name)) {
      edits.push({ op: 'scene.clear', name: scene.name });
    }
  }
  for (const scene of after) {
    const was = before.find((one) => one.name === scene.name);
    if (was && sameScene(was, scene)) continue;
    edits.push({ op: 'scene.set', name: scene.name, clips: [...scene.clips], machine: scene.machine ?? null });
  }
  const kept = before.map((one) => one.name).filter((name) => after.some((one) => one.name === name));
  const now = after.map((one) => one.name).filter((name) => before.some((one) => one.name === name));
  if (kept.join(' ') !== now.join(' ')) {
    notes.push('the order of the scenes changed; this vocabulary defines a scene by name and cannot reorder them.');
  }
}

/**
 * The machine's edits: one `machine.set` for the mix, clock and counts, then a pad
 * line per pad, then one `pad.step` per hit that moved.
 *
 * The order is forced by the vocabulary, not chosen: `machine.set` with a new
 * `steps`, `pads` or `bars` resizes or trims the rows, so it must be applied before
 * the pads, and the pads are then written against the new shape — the same way
 * `machine steps N` sits above the pads in a script. A pad BEYOND the ones the song
 * had is compared against the seed it will be created from, so a brand-new pad is
 * the same kind of fact as a changed one.
 *
 * What cannot be said is noted rather than approximated: a machine that was
 * removed (the vocabulary never removes one).
 */
function machineEdits(
  before: DrumMachine | null,
  after: DrumMachine | null,
  edits: ApiInput[],
  notes: string[],
): void {
  if (!after) {
    if (before) notes.push('the drum machine was removed; this vocabulary cannot remove a machine.');
    return;
  }

  // The mix and the clock, in one edit. Every field is compared, so a diff of the
  // machine's fader is one line and not a rewritten instrument.
  const mix: ApiInput = { op: 'machine.set' };
  if (!before || before.enabled !== after.enabled) mix.enabled = after.enabled;
  if (!before || before.steps !== after.steps) mix.steps = after.steps;
  if (!before || before.beat !== after.beat) mix.beat = after.beat;
  if (!before || before.swing !== after.swing) mix.swing = after.swing;
  if (!before || before.level !== after.level) mix.level = after.level;
  if (!before || before.pan !== after.pan) mix.pan = after.pan;
  if (!before || (before.bus ?? '') !== (after.bus ?? '')) mix.bus = after.bus ?? '';
  if (!before || before.verb !== after.verb) mix.verb = after.verb;
  if (!before || before.echo !== after.echo) mix.echo = after.echo;
  if (!before || before.duck !== after.duck) mix.duck = after.duck;
  const effectIds = TRACK_EFFECTS.map((effect) => effect.id).filter(
    (id) => !before || before.effects[id] !== after.effects[id],
  );
  if (effectIds.length > 0) {
    mix.effects = Object.fromEntries(effectIds.map((id) => [id, after.effects[id]]));
  }
  // The order says which bar plays in each song bar. Compared RAW — the model's
  // `machineOrder` reads an empty list as `[1]`, which would hide a clearing.
  if (!before || before.order.join(' ') !== after.order.join(' ')) mix.order = [...after.order];
  // The pad and bar COUNTS, so a machine that grew or shrank says so once instead
  // of by a note. Creating a machine gives it `INITIAL_PADS` pads and one bar, so a
  // song that was newly given one compares against that.
  const hadPads = before ? before.pads.length : INITIAL_PADS;
  if (hadPads !== after.pads.length) mix.pads = after.pads.length;
  const hadBars = before ? machineBarCount(before) : 1;
  const afterCount = machineBarCount(after);
  if (hadBars !== afterCount) mix.bars = afterCount;
  if (Object.keys(mix).length > 1) edits.push(mix);

  after.pads.forEach((pad, index) => {
    // The pad the machine will actually have before this diff's edits land: the
    // one it had, or the seed `pad.set` creates it from.
    const seed = before?.pads[index] ?? defaultPad(index + 1, after.steps);

    const set: ApiInput = { op: 'pad.set', pad: index + 1 };
    if (seed.name !== pad.name) set.name = pad.name;
    if (seed.level !== pad.level) set.level = pad.level;
    if (seed.pan !== pad.pan) set.pan = pad.pan;
    // Tuning is the pad's distance from its kit pitch, the language's own way of
    // saying where a pad's note is, so a moved pitch is one `tune`.
    if (seed.pitch !== pad.pitch) set.tune = pad.pitch - defaultPad(index + 1, after.steps).pitch;
    if (seed.voice.wave !== pad.voice.wave) set.wave = pad.voice.wave;
    if ((seed.sample ?? '') !== (pad.sample ?? '')) set.sample = pad.sample ?? '';
    for (const param of VOICE_PARAMS) {
      if (seed.voice[param.id] !== pad.voice[param.id]) set[param.id] = pad.voice[param.id];
    }
    if (Object.keys(set).length > 2) edits.push(set);

    // The hits, one at a time, read at the size the machine will have — so a diff
    // of a grown machine is the hits that moved and not a rewritten row.
    const wasRow = resizeRow(seed.steps, after.steps);
    const nowRow = resizeRow(pad.steps, after.steps);
    for (let step = 0; step < after.steps; step += 1) {
      if (wasRow[step] !== nowRow[step]) {
        edits.push({ op: 'pad.step', pad: index + 1, step, velocity: nowRow[step] });
      }
    }
  });

  // Bars 2..N: another row per pad, diffed exactly as bar 1's rows are, one
  // `pad.step` with a `bar` per hit that moved. A bar the diff ADDS is compared
  // against the row the `bars` count above will actually grow it FROM — the COPY
  // of the last bar, `+ BAR`'s bargain — not against rests, or every inherited hit
  // would be left behind as a difference the diff never wrote. A bar the diff
  // REMOVES is reached by the `bars` count, which drops it (and clamps the order)
  // before these run.
  const beforeCount = hadBars;
  const lastRows = before ? machineBarRows(before, beforeCount) : null;
  for (let bar = 2; bar <= afterCount; bar += 1) {
    const wasRows = before && bar <= beforeCount
      ? machineBarRows(before, bar)
      : (lastRows ?? after.pads.map(() => []));
    const nowRows = machineBarRows(after, bar);
    after.pads.forEach((_pad, index) => {
      const was = resizeRow(wasRows[index] ?? [], after.steps);
      const now = resizeRow(nowRows[index] ?? [], after.steps);
      for (let step = 0; step < after.steps; step += 1) {
        if (was[step] !== now[step]) {
          edits.push({ op: 'pad.step', pad: index + 1, bar, step, velocity: now[step] });
        }
      }
    });
  }
}

/**
 * The ARP page's dials: one `arp.set` carrying the dials that moved, or an
 * `arp.clear` when the after song keeps none.
 *
 * Only the STORED dials need a line here: the notes a `write` produced are
 * ordinary cells, so they already come out as `cell.set` diffs and a replay
 * reproduces the song. Carrying only the fields that differ keeps a diff of one
 * knob to one line rather than a whole set of dials that never moved, and an edit
 * on a song with no dials names every field — which is what `applyArpSet` merges
 * over `DEFAULT_ARP` anyway.
 */
function arpEdits(
  before: ArpSettings | null,
  after: ArpSettings | null,
  edits: ApiInput[],
): void {
  if (after === null) {
    if (before !== null) edits.push({ op: 'arp.clear' });
    return;
  }
  const edit: ApiInput = { op: 'arp.set' };
  if (!before || before.direction !== after.direction) edit.direction = after.direction;
  if (!before || before.octaves !== after.octaves) edit.octaves = after.octaves;
  if (!before || before.rate !== after.rate) edit.rate = after.rate;
  if (!before || before.gate !== after.gate) edit.gate = after.gate;
  if (!before || before.mode !== after.mode) edit.mode = after.mode;
  edits.push(edit);
}

/**
 * The ARRANGER's lanes: one `automation.set` per lane that moved, addressed by
 * its 1-based position, then an `automation.clear` for any lane that went away.
 *
 * A lane has no name, so POSITION is its handle — the reading order
 * `sortAutomationLanes` keeps. Writing the edits in this order is what makes a
 * diff exact: every `set` replaces a lane in place (or appends past the end), and
 * the trailing `clear`s are always at indices beyond the ones already written, so
 * removing one never shifts a lane a `set` has yet to reach. An emptied list is
 * one `automation.clear` with no index rather than a line per lane.
 */
function automationEdits(
  before: readonly AutomationLane[],
  after: readonly AutomationLane[],
  edits: ApiInput[],
): void {
  for (let index = 0; index < after.length; index += 1) {
    const was = before[index];
    const now = after[index] as AutomationLane;
    if (was && sameLane(was, now)) continue;
    edits.push({
      op: 'automation.set',
      index: index + 1,
      track: now.track,
      target: now.target,
      from: now.from,
      to: now.to,
      startBar: now.startBar,
      endBar: now.endBar,
    });
  }
  if (after.length === 0 && before.length > 0) {
    edits.push({ op: 'automation.clear' });
    return;
  }
  // Descending, so removing the last lane first never moves an earlier one.
  for (let index = before.length - 1; index >= after.length; index -= 1) {
    edits.push({ op: 'automation.clear', index: index + 1 });
  }
}

/**
 * The edits that turn `before` into `after`, plus what could not be expressed.
 *
 * The order of the list is deliberate and matches the way a person changes a song:
 * the header first, then the channels, then the cells, then the arrangement — so a
 * caller reading the list top to bottom sees the shape of the song before its
 * details.
 */
export function diffSongs(before: Song, after: Song): SongDiff {
  const edits: ApiInput[] = [];
  const notes: string[] = [];
  const beforeText = serialized(before);
  const afterText = serialized(after);
  const comparable = beforeText !== null && afterText !== null;
  if (!comparable) notes.push('one of these songs could not be written, so the two cannot be compared field for field.');

  // --- the header -----------------------------------------------------------
  const header: ApiInput = { op: 'song.set' };
  if (before.title !== after.title) header.title = after.title;
  if (before.bpm !== after.bpm) header.bpm = after.bpm;
  if (keyName(before.key) !== keyName(after.key)) header.key = keyName(after.key);
  if (before.swing !== after.swing) header.swing = after.swing;
  if (patternRows(before) !== patternRows(after)) header.rows = patternRows(after);
  if (before.rowsPerBeat !== after.rowsPerBeat) header.rowsPerBeat = after.rowsPerBeat;
  if (before.groove !== after.groove) header.groove = after.groove;
  if (before.kit !== after.kit) header.kit = after.kit;
  if (before.reverb !== after.reverb) header.room = after.reverb;
  if (before.echo !== after.echo) header.echo = after.echo;
  if (Object.keys(header).length > 1) edits.push(header);

  // --- the groups and the whole mix -----------------------------------------
  // A group comes BEFORE the channels that join it, because a `track.set` that
  // names a group the song does not have yet is refused — the same order a script
  // follows ("bus DRUMS 70", then "track 1 bus DRUMS").
  busEdits(before.buses, after.buses, edits, notes);
  const masterIds = TRACK_EFFECTS.map((effect) => effect.id).filter((id) => before.master[id] !== after.master[id]);
  if (masterIds.length > 0) {
    edits.push({ op: 'master.set', effects: Object.fromEntries(masterIds.map((id) => [id, after.master[id]])) });
  }

  // --- the ARP page's dials -------------------------------------------------
  arpEdits(before.arp, after.arp, edits);

  // --- the channels ---------------------------------------------------------
  // Only the channels both songs have. A song that gained or lost one cannot be
  // reached by this vocabulary, and that is noted rather than approximated.
  const shared = Math.min(before.tracks.length, after.tracks.length);
  for (let index = 0; index < shared; index += 1) {
    const was = before.tracks[index];
    const now = after.tracks[index];
    if (!was || !now) continue;
    const edit: ApiInput = { op: 'track.set', track: index + 1 };
    if (was.name !== now.name) edit.name = now.name;
    if (was.level !== now.level) edit.level = now.level;
    if (was.pan !== now.pan) edit.pan = now.pan;
    if (was.hold !== now.hold) edit.hold = now.hold;
    if (was.glide !== now.glide) edit.glide = now.glide;
    if (was.vibrato !== now.vibrato) edit.vibrato = now.vibrato;
    if (was.verb !== now.verb) edit.verb = now.verb;
    if (was.echo !== now.echo) edit.echo = now.echo;
    if (was.duck !== now.duck) edit.duck = now.duck;
    if (was.poly !== now.poly) edit.poly = now.poly;
    if (was.muted !== now.muted) edit.muted = now.muted;
    // The group a channel is on: an absent one is written as an empty string,
    // which is how `bus` says "leave every group".
    if ((was.bus ?? '') !== (now.bus ?? '')) edit.bus = now.bus ?? '';
    // Only the effects that moved, so a diff of one knob is one `track.set`.
    const moved = TRACK_EFFECTS.map((effect) => effect.id).filter((id) => was[id] !== now[id]);
    if (moved.length > 0) edit.effects = Object.fromEntries(moved.map((id) => [id, now[id]]));
    // A recording is one more name a channel can carry; an absent one is written
    // as an empty string, which is how `sample.set` says "leave the one it has".
    if ((was.sample ?? '') !== (now.sample ?? '')) edit.sample = now.sample ?? '';
    if (Object.keys(edit).length > 2) edits.push(edit);
  }

  // --- the form -------------------------------------------------------------
  sectionEdits(before.sections, after.sections, edits, notes);

  // --- the live launch grid -------------------------------------------------
  sceneEdits(before.scenes, after.scenes, edits, notes);

  // --- the drum machine -----------------------------------------------------
  machineEdits(before.machine, after.machine, edits, notes);

  // --- the automation lanes -------------------------------------------------
  automationEdits(before.automation, after.automation, edits);

  // --- the cells ------------------------------------------------------------
  // Walked over `after`, and a cell `before` does not have is read as an EMPTY
  // cell rather than as a difference — so a pattern that was added stays one edit
  // (its name) instead of a line per empty step it never had.
  after.patterns.forEach((pattern, patternIndex) => {
    pattern.steps.forEach((row, rowIndex) => {
      row.forEach((cell, trackIndex) => {
        const was = before.patterns[patternIndex]?.steps[rowIndex]?.[trackIndex] ?? emptyCell();
        if (sameCell(was, cell)) return;
        const at = { pattern: patternIndex + 1, row: rowIndex, track: trackIndex + 1 };
        const feelMoved = was.velocity !== cell.velocity || was.slide !== cell.slide || was.stutter !== cell.stutter;
        if (cell.note === null && cell.drum === null) {
          // An emptied step whose FEEL also moved needs `cell.set` with an empty
          // note list, because `cell.clear` empties the notes and leaves the
          // velocity where it was — the one corner where clear alone is lossy.
          edits.push(feelMoved ? { op: 'cell.set', ...at, notes: [] , velocity: cell.velocity, slide: cell.slide, stutter: cell.stutter } : { op: 'cell.clear', ...at });
          return;
        }
        const edit: ApiInput = { op: 'cell.set', ...at };
        if (cell.drum !== null) edit.drum = cell.drum;
        else edit.notes = cellNotes(cell);
        // Only the feel that actually moved, so a diff of one note is one line.
        if (was.velocity !== cell.velocity) edit.velocity = cell.velocity;
        if (was.slide !== cell.slide) edit.slide = cell.slide;
        if (was.stutter !== cell.stutter) edit.stutter = cell.stutter;
        edits.push(edit);
      });
    });
  });

  // --- the arrangement ------------------------------------------------------
  // The order first, then the arrangement claim on top of it: `order.set` forgets
  // any arrangement, and `arrange.set` re-builds the order from the names — so
  // writing the two in this order is what reproduces a song that has both.
  const orderChanged = before.order.join(' ') !== after.order.join(' ');
  const arrangementChanged = before.arrangement.join(' ') !== after.arrangement.join(' ');
  if (orderChanged) {
    edits.push({ op: 'order.set', order: [...after.order] });
  }
  if (after.arrangement.length > 0) {
    // Only when the names really expand to the order the song ends with; an
    // arrangement that contradicts the order is a claim the vocabulary cannot
    // write, and a note says so rather than a wrong `arrange.set`.
    const { bars, missing } = arrangementBars(after.sections, after.arrangement);
    const describes = missing === null && bars.length === after.order.length && bars.every((bar, i) => bar === after.order[i]);
    if (!describes) {
      notes.push('the arrangement names sections that do not expand to the song\u2019s order, so it is not in the edits.');
    } else if (arrangementChanged || orderChanged) {
      // `order.set` above forgets the arrangement, so a song that keeps one needs
      // this even when only the order moved.
      edits.push({ op: 'arrange.set', sections: [...after.arrangement] });
    }
  } else if (before.arrangement.length > 0) {
    edits.push({ op: 'arrange.set', sections: [] });
  }

  // --- what the vocabulary cannot say ---------------------------------------
  if (before.tracks.length !== after.tracks.length) {
    notes.push(
      `channels went from ${before.tracks.length} to ${after.tracks.length}; this vocabulary cannot add or remove a channel.`,
    );
  }
  if (after.patterns.length < before.patterns.length) {
    notes.push(`patterns went from ${before.patterns.length} to ${after.patterns.length}; this vocabulary cannot remove a pattern.`);
  }
  if (after.patterns.length > before.patterns.length) {
    // A pattern holding something is created as a side effect of writing into it,
    // so those are reachable. An EMPTY one is not: nothing in the vocabulary makes
    // a pattern with no step to write, and saying nothing would be a silent loss.
    const extras = after.patterns.slice(before.patterns.length);
    const blank = extras.every((pattern) =>
      pattern.steps.every((row) => row.every((cell) => cell.note === null && cell.drum === null)),
    );
    if (blank) notes.push('an empty pattern was added; this vocabulary creates a pattern only by writing a step into it.');
  }
  const renamed = after.patterns.some((pattern, index) => before.patterns[index] && before.patterns[index]?.name !== pattern.name);
  if (renamed) notes.push('a pattern was renamed; this vocabulary names no patterns.');
  for (const field of OPAQUE_FIELDS) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      notes.push(`"${field}" changed; it is not part of the edit vocabulary.`);
    }
  }

  // --- prove it -------------------------------------------------------------
  const changes: EditChange[] = [];
  let verified = false;
  if (edits.length > 0) {
    try {
      const replay = structuredClone(before);
      changes.push(...applyEdits(replay, edits));
      const rewritten = serialized(replay);
      verified = rewritten !== null && rewritten === afterText;
    } catch {
      verified = false;
    }
  } else {
    verified = comparable && beforeText === afterText;
  }

  return {
    identical: comparable && beforeText === afterText,
    changed: edits.length,
    edits,
    changes,
    notes,
    verified,
  };
}
