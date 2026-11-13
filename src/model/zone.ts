/**
 * KEYZONES — which recording a channel plays, per part of the keyboard.
 *
 * ── The problem this solves ────────────────────────────────────────────────
 * A channel names ONE recording (`sample BRK02`), and every note it plays is that
 * file transposed from middle C. An instrument recorded across a keyboard — a
 * piano with its low and high octaves sampled separately, a drum kit's tom that
 * only sounds right near its own pitch — played that way is a whole file stretched
 * into every register: the low notes slow and muddy, the high ones thin.
 *
 * A keyzone says "from this note upward, play THAT recording". The lowest zone
 * therefore owns everything BELOW it too — a map covers the whole keyboard or it
 * is not a map — and the channel's own `sample` is the floor under the map rather
 * than under its notes: it plays when the map is empty, and when the zone a note
 * lands in names a file this machine does not have. Either way a channel with a
 * keymap always sounds, so a keymap is never a promise the song cannot keep.
 *
 * ── Why notes and not a table of ranges ─────────────────────────────────────
 * A zone's `note` is where it STARTS, and it runs until the next zone begins. That
 * makes the zones a list of boundaries rather than a list of overlapping ranges,
 * so they cannot disagree about who owns a note, cannot leave a hole, and cannot
 * be written out in two orders that mean the same thing. One sorted list, one
 * answer per note — and a person adding a zone never has to know where the one
 * above it ends, because its end is the next one's start.
 */

/** One boundary: from `note` upward, the channel plays `sample`. */
export interface KeyZone {
  /** The MIDI note this zone starts at, 0..127. A low zone lives near 0. */
  note: number;
  /** The recording's name, as the bank stores it. See `model/sample.ts`. */
  sample: string;
}

/** How many boundaries one channel may have. Eight, the bank's own ceiling. */
export const MAX_ZONES = 8;

/** The lowest and highest notes a keyzone may start at. */
export const MIN_ZONE_NOTE = 0;
export const MAX_ZONE_NOTE = 127;

/** A note number the model can hold: whole, and inside the keyboard. */
export function clampZoneNote(note: number): number {
  if (!Number.isFinite(note)) return MIN_ZONE_NOTE;
  return Math.max(MIN_ZONE_NOTE, Math.min(MAX_ZONE_NOTE, Math.round(note)));
}

/**
 * A keymap the model can hold: sorted by note, no two starting on the same one.
 *
 * Two zones on one note is not a disagreement about a range — it is two answers
 * for one note, and the file/replay/UI would all have to pick one. Keeping the
 * LAST written is the rule, the way a track line's later statement wins, and the
 * rest keeps its order so a keymap saves in the order it was written.
 */
export function tidyZones(zones: readonly KeyZone[]): KeyZone[] {
  const byNote = new Map<number, KeyZone>();
  for (const zone of zones) {
    const note = clampZoneNote(zone.note);
    byNote.set(note, { note, sample: zone.sample });
  }
  return [...byNote.values()].sort((a, b) => a.note - b.note).slice(0, MAX_ZONES);
}

/**
 * The recording a keymap gives a note, or null for a channel with no keymap.
 *
 * The highest boundary at or below the note owns it; a note BELOW every boundary
 * belongs to the lowest zone rather than to nothing, because a keymap's purpose is
 * a different sound per register, not a silent bottom octave — the same span
 * `zoneSpans` reports, with the bottom zone starting at note 0. Null (rather than
 * the channel's own sample) lets the caller apply its own fallback: the engine and
 * the renderer both want the channel's `sample`, but a test wants to see the
 * keymap's answer on its own.
 */
export function zoneFor(zones: readonly KeyZone[] | undefined, midi: number): string | null {
  if (!zones || zones.length === 0) return null;
  let chosen: KeyZone | null = null;
  for (const zone of zones) {
    if (zone.note <= midi && (chosen === null || zone.note > chosen.note)) chosen = zone;
  }
  if (chosen !== null) return chosen.sample;
  // Below every boundary: the lowest one, which is the bottom of the map.
  let lowest: KeyZone | null = null;
  for (const zone of zones) {
    if (lowest === null || zone.note < lowest.note) lowest = zone;
  }
  return lowest === null ? null : lowest.sample;
}

/** A span of the keyboard one zone owns, for a UI that lists them. */
export interface ZoneSpan {
  /** The boundary the zone starts at. */
  note: number;
  /** The last note it owns, or 127 for the top zone. */
  through: number;
  sample: string;
}

/**
 * A keymap as the spans a person sees: `0..59 PIANO_LOW`, `60..127 PIANO_HIGH`.
 *
 * Derived rather than stored, because an end is the next start and storing both
 * gives a file two truths to keep in step. The bottom zone's span starts at 0 —
 * not at its own boundary — because everything under the lowest zone plays it too.
 */
export function zoneSpans(zones: readonly KeyZone[]): ZoneSpan[] {
  const sorted = tidyZones(zones);
  return sorted.map((zone, index) => ({
    note: index === 0 ? MIN_ZONE_NOTE : zone.note,
    through: index === sorted.length - 1 ? MAX_ZONE_NOTE : sorted[index + 1].note - 1,
    sample: zone.sample,
  }));
}
