/**
 * live — performing a song's SCENES, as pure arithmetic.
 *
 * The tracker plays one thing: the `order`, top to bottom, looping. The LIVE page
 * plays the other kind of music — launch a scene and it loops until you launch
 * the next one — and this file is the arithmetic behind it, kept out of the
 * engine and the scene so both can ask the same question and get the same answer.
 *
 * ── The two ideas ────────────────────────────────────────────────────────────
 *
 * A **cue** is a launch that has been ASKED for but has not happened yet: a scene
 * (or the order, for STOP ALL) and the STEP it takes over at. Queuing rather than
 * switching is the whole point of the live page — a launch lands on a bar line, so
 * it is a musical decision rather than a race with the clock.
 *
 * A **boundary** is where a cue lands. `live quantize 4` means the next four-bar
 * line; `0` means the very next step, which is the one setting that is not a wait.
 *
 * Because the engine's step counter only ever runs FORWARD within one playback
 * (it is reset by `stop`, never by a loop), a cue can be keyed by an absolute step
 * and resolved for any step the scheduler looks ahead at. That is what keeps the
 * notes the ear hears identical to the notes the playhead says — the callback is
 * asked about a step that has not sounded yet, and it has to give the same answer
 * the transport will be giving when it does.
 *
 * ── What a scene plays ───────────────────────────────────────────────────────
 *
 * A scene is ONE BAR. Each channel plays its clip's pattern at the row the
 * transport is passing through, so the row within the scene's bar is `step % rows`
 * — the same `rowNotes` the linear scheduler reads, one pattern per channel
 * instead of one pattern for all of them. Nothing is copied and nothing is
 * re-derived, which is why performing and exporting cannot disagree about a note.
 *
 * Phaser-free and audio-free like the rest of `model/`.
 */

import { patternRows, rowNotes, stepToSlot, type Song } from './song';

/** The notes one step of a bar sounds — the shape `rowNotes` answers with. */
export type LiveNote = ReturnType<typeof rowNotes>[number];

/**
 * A launch that takes over at a step.
 *
 * `scene` is an index into `song.scenes`, or `null` for STOP ALL — which returns
 * the transport to the song's own `order`, at the step the counter has reached.
 * `null` is a real value rather than an absence: it is the instruction "stop
 * performing", and it is what makes a queued stop different from having queued
 * nothing at all.
 */
export interface LiveCue {
  atStep: number;
  scene: number | null;
}

/**
 * How many steps one quantize span covers.
 *
 * `bars` bars, where a bar is one pattern (`rowsPerBar` steps) — the same bar an
 * arrangement slot is. `0` is the one value that is not a wait: it takes over at
 * the very next step, so its span is a single step rather than zero (a span of
 * zero would mean "never", which is the opposite of "now").
 */
export function quantizeSpan(bars: number, rowsPerBar: number): number {
  const per = Math.max(1, Math.round(rowsPerBar));
  const whole = Math.max(0, Math.round(bars));
  return whole === 0 ? 1 : whole * per;
}

/**
 * The first step AFTER `fromStep` where a launch lands.
 *
 * Strictly after, because a launch asked for mid-bar waits for the NEXT line
 * rather than snapping backwards to the one it is already inside — the point of a
 * quantize is that the launch is never early.
 */
export function nextBoundary(fromStep: number, bars: number, rowsPerBar: number): number {
  const span = quantizeSpan(bars, rowsPerBar);
  const at = Math.max(0, Math.floor(Number.isFinite(fromStep) ? fromStep : 0));
  if (span === 1) return at + 1;
  return (Math.floor(at / span) + 1) * span;
}

/** Whether `step` is a line a launch could land on, for a screen that draws them. */
export function isBoundary(step: number, bars: number, rowsPerBar: number): boolean {
  if (step < 0) return false;
  const span = quantizeSpan(bars, rowsPerBar);
  return span === 1 ? true : step % span === 0;
}

/**
 * Add a cue, replacing any cue that lands at the same step.
 *
 * Replacing rather than stacking is what makes two launches inside one span mean
 * "the second one wins" — a person who presses one scene and then another before
 * the bar line meant the second, and two libraries playing at once is never what
 * they meant.
 */
export function withCue(cues: readonly LiveCue[], cue: LiveCue): LiveCue[] {
  const at = Math.max(0, Math.floor(cue.atStep));
  const next = cues.filter((one) => one.atStep !== at);
  next.push({ atStep: at, scene: cue.scene });
  return next.sort((a, b) => a.atStep - b.atStep);
}

/**
 * Forget the cues that can no longer matter, keeping the one in force.
 *
 * Called as the transport runs so a long performance does not accumulate a cue
 * per launch. The cue that is IN FORCE is kept, because it is the answer for
 * every step until the next one, and dropping it would silently stop performing.
 */
export function pruneCues(cues: readonly LiveCue[], step: number): LiveCue[] {
  const active = activeCue(cues, step);
  const keep = cues.filter((one) => one.atStep > step || one === active);
  return keep.sort((a, b) => a.atStep - b.atStep);
}

/** The cue in force at `step` — the last launch that has happened by then. */
export function activeCue(cues: readonly LiveCue[], step: number): LiveCue | null {
  let found: LiveCue | null = null;
  for (const cue of cues) {
    if (cue.atStep > step) break;
    found = cue;
  }
  return found;
}

/** The launch still to happen at `step`, if any — what a screen shows as queued. */
export function pendingCue(cues: readonly LiveCue[], step: number): LiveCue | null {
  for (const cue of cues) {
    if (cue.atStep > step) return cue;
  }
  return null;
}

/**
 * The scene performing at `step`, or `null` for the song's own `order`.
 *
 * The ONE reading of the cue list: the scheduler's notes, the page's lit row and
 * (later) the API all come through here, so a launch cannot sound one scene while
 * a screen says another.
 */
export function activeScene(cues: readonly LiveCue[], step: number): number | null {
  return activeCue(cues, step)?.scene ?? null;
}

/** Which row of the scene's bar a step falls on, 0-based like every row here. */
export function liveRowAt(step: number, rowsPerBar: number): number {
  const per = Math.max(1, Math.round(rowsPerBar));
  const at = Math.floor(Number.isFinite(step) ? step : 0);
  return ((at % per) + per) % per;
}

/**
 * One channel's clip in a scene: which pattern it plays, or `null` for silence.
 *
 * 1-based pattern numbers, the numbers `order` and `scene` lines use — so a clip
 * CANNOT go stale when a pattern is edited, because it is a reference to the
 * pattern rather than a copy of its notes.
 */
export function sceneClip(song: Song, sceneIndex: number, channel: number): number | null {
  const scene = song.scenes[Math.round(sceneIndex)];
  if (!scene) return null;
  return scene.clips[Math.round(channel)] ?? null;
}

/** How many scenes a song can launch, for a screen deciding whether it can perform. */
export function canPerform(song: Song): boolean {
  return song.scenes.length > 0;
}

/**
 * The notes one step of a performing scene sounds.
 *
 * The scene's own row, read through the SAME `rowNotes` the linear scheduler
 * uses, one pattern per channel: a channel with no clip is silent, and a clip
 * that names a pattern the song no longer has is silent too rather than a crash —
 * a scene is a reference, and a reference to nothing is nothing.
 */
export function sceneStepNotes(song: Song, sceneIndex: number, step: number): LiveNote[] {
  const scene = song.scenes[Math.round(sceneIndex)];
  if (!scene) return [];
  const row = liveRowAt(step, patternRows(song));
  const out: LiveNote[] = [];
  scene.clips.forEach((clip, channel) => {
    if (clip === null) return;
    const pattern = song.patterns[clip - 1];
    if (!pattern) return;
    // The clip's pattern is read at this channel's COLUMN only: a scene says what
    // each channel plays, so another channel's notes in the borrowed pattern are
    // not this scene's — that is the difference between a scene and the order.
    for (const note of rowNotes(pattern, row)) {
      if (note.track === channel) out.push(note);
    }
  });
  return out;
}

/**
 * The notes one step of the PERFORMANCE sounds: the active scene, or the song's own
 * `order` when nothing is performing.
 *
 * This is the whole live decision in one place, and the only thing the scheduler
 * asks it. It is pure and takes both readings of the step — the wrapping `step` the
 * grid counts in, and the forward `absoluteStep` a launch is keyed to — so the
 * callback stays a one-line delegation and a test can check a launch against the
 * exact notes the ear would hear, with no engine and no clock.
 */
export function stepNotes(
  song: Song,
  cues: readonly LiveCue[],
  step: number,
  absoluteStep: number,
): LiveNote[] {
  const scene = activeScene(cues, absoluteStep);
  if (scene !== null) return sceneStepNotes(song, scene, absoluteStep);
  const { pattern, row } = stepToSlot(song, step);
  return rowNotes(song.patterns[pattern], row);
}

/**
 * A scene rendered as the pattern each channel would play in a given bar — the
 * reading a screen wants for its cells, and a test wants to check the notes.
 *
 * One entry per channel: the 1-based pattern it plays, or `null` for silence.
 */
export function sceneRow(song: Song, sceneIndex: number): (number | null)[] {
  const scene = song.scenes[Math.round(sceneIndex)];
  return scene ? scene.clips.slice() : [];
}

/**
 * Whether a scene would sound anything at all.
 *
 * A scene whose every clip is silent is a row that does nothing when it is
 * launched, which is worth saying out loud rather than performing to silence.
 */
export function sceneIsSilent(song: Song, sceneIndex: number): boolean {
  const scene = song.scenes[Math.round(sceneIndex)];
  if (!scene) return true;
  return scene.clips.every((clip) => clip === null);
}
