/**
 * historyRows — the undo timeline as a list a person can read.
 *
 * The undo stack holds whole SONG snapshots, which is what makes undo free of
 * bookkeeping and also what makes a bare list of them useless: "step 7" says
 * nothing. So each row is described by what actually CHANGED between it and the
 * state before it — the tempo, a channel's level, the bar count, a run of notes —
 * computed by diffing the two, which needs nothing stored beside a snapshot and
 * cannot drift out of step with the thing it describes.
 *
 * Pure and Phaser-free, so the sentences are checked without a canvas. The diff
 * is deliberately shallow and ordered widest-first: the whole song's shape, then
 * the channels one at a time, then the notes. A first difference is reported
 * rather than every difference, because a row is a label and not a report.
 */

import { countSongNotes, keyName, patternRows, type Song } from '../model';

/** The least a state has to be for a row: the song it holds. */
export interface HistoryStep {
  song: Song;
}

/** One line of the timeline. */
export interface HistoryRow {
  /** `NOW`, `1 BACK`, `2 BACK` … — how far into the past the state is. */
  label: string;
  /** What changed to reach it, in a few words. */
  detail: string;
}

/**
 * The whole timeline, NEWEST first, ready to draw as a list.
 *
 * `steps` is the undo stack oldest-first (what `History.states()` hands back) and
 * `current` is the state on screen now, which is not in the stack. The oldest row
 * is labelled as where the session began rather than described, because there is
 * nothing before it to compare against.
 */
export function historyRows(steps: readonly HistoryStep[], current: HistoryStep): HistoryRow[] {
  const chain = [...steps.map((step) => step.song), current.song];
  const rows: HistoryRow[] = [];
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const back = chain.length - 1 - i;
    rows.push({
      label: back === 0 ? 'NOW' : `${back} BACK`,
      detail: i === 0 ? 'WHERE THE SESSION BEGAN' : describeChange(chain[i - 1], chain[i]),
    });
  }
  return rows;
}

/**
 * What one edit did, as a short phrase — or `EDITED` when nothing this diff
 * knows how to name moved (a pattern the cursor was on, a name, a detail deep in
 * a sound), which is honest about the depth of the comparison.
 *
 * Ordered from the top of the song down, so a change that moves several things
 * reports the one a person would name first: a new title is not "notes changed".
 */
export function describeChange(before: Song, after: Song): string {
  if (before.title !== after.title) return `TITLE  -  ${after.title.toUpperCase()}`;
  if (before.bpm !== after.bpm) return `TEMPO  ${before.bpm} -> ${after.bpm}`;
  if (before.rowsPerBeat !== after.rowsPerBeat) return `GRID  ${after.rowsPerBeat} STEPS A BEAT`;
  if (keyName(before.key) !== keyName(after.key)) return `KEY  ${keyName(after.key)}`;
  if (before.tracks.length !== after.tracks.length) {
    return `CHANNELS  ${before.tracks.length} -> ${after.tracks.length}`;
  }
  if (before.patterns.length !== after.patterns.length) {
    return `PATTERNS  ${before.patterns.length} -> ${after.patterns.length}`;
  }
  if (before.order.length !== after.order.length) {
    return `BARS  ${before.order.length} -> ${after.order.length}`;
  }
  if (before.arrangement.length !== after.arrangement.length) {
    return 'THE FORM';
  }
  for (let i = 0; i < before.tracks.length; i += 1) {
    const was = before.tracks[i];
    const now = after.tracks[i];
    if (was.name !== now.name) return `CHANNEL ${i + 1}  -  ${now.name.toUpperCase()}`;
    if (was.level !== now.level) return `CHANNEL ${i + 1}  LEVEL ${was.level} -> ${now.level}`;
    if (was.muted !== now.muted) return `CHANNEL ${i + 1}  ${now.muted ? 'MUTED' : 'UNMUTED'}`;
    if (JSON.stringify(was.voice) !== JSON.stringify(now.voice)) return `CHANNEL ${i + 1}  SOUND`;
  }
  if (patternRows(before) !== patternRows(after)) return `STEPS  ${patternRows(after)}`;
  if (before.kit !== after.kit) return `DRUMS  ${after.kit.toUpperCase()}`;
  const notes = countSongNotes(after) - countSongNotes(before);
  if (notes !== 0) return `NOTES  ${notes > 0 ? '+' : ''}${notes}`;
  return 'EDITED';
}
