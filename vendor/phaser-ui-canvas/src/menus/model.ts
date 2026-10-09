/**
 * model — a menu as data, and the cursor that walks it.
 *
 * This is the reusable core of the original editor's right-hand panel, lifted
 * out of the editor: a menu is a title, a list of ROWS, and a cursor. A row is
 * one of five kinds, and the kind is also how it is drawn:
 *
 *   header   a section label. Not selectable.
 *   choice   one of a list; `on` marks the current one.
 *   nav      opens a submenu (drawn with a chevron).
 *   back     returns to the level above.
 *   action   a one-shot command, with an optional right-aligned value.
 *
 * The model never mutates anything. It answers "what is under the cursor",
 * "what is next", and the app decides what that means — the original's rule,
 * kept because it is what makes the same table answer a click, a keypress and
 * the unit tests.
 *
 * Phaser-free: this is arithmetic worth testing.
 */

export type MenuRowKind = 'header' | 'choice' | 'nav' | 'back' | 'action';

export interface MenuRow {
  /** Stable id, for tests and for the app's own bookkeeping. */
  id: string;
  label: string;
  kind: MenuRowKind;
  /** For a `choice`: this one is the current selection. */
  on?: boolean;
  /** Dim second line / right-aligned value (a count, a live value). */
  value?: string;
  /** Left-gutter colour swatch. */
  swatch?: number;
  /** Registered icon name drawn in the gutter instead of a swatch. */
  icon?: string;
  /** A greyed row the cursor skips. */
  disabled?: boolean;
  /** Opaque payload handed back when the row is activated. */
  data?: unknown;
}

export interface MenuView {
  /** Heading shown at the top of the panel. */
  title: string;
  rows: MenuRow[];
  /** The row the keyboard cursor is on (never a header; -1 if there are none). */
  cursor: number;
}

/** A row the cursor may land on. */
export function isSelectable(row: MenuRow): boolean {
  return row.kind !== 'header' && row.disabled !== true;
}

/** The selectable row indices, in order. */
export function selectable(rows: readonly MenuRow[]): number[] {
  return rows.map((r, i) => (isSelectable(r) ? i : -1)).filter((i) => i >= 0);
}

/** The nearest selectable row at or after `from`; -1 when there are none. */
export function clampCursor(rows: readonly MenuRow[], from: number): number {
  const spots = selectable(rows);
  if (spots.length === 0) return -1;
  if (from <= spots[0]) return spots[0];
  if (from >= spots[spots.length - 1]) return spots[spots.length - 1];
  return spots.find((i) => i >= from) ?? spots[spots.length - 1];
}

/** Move the cursor `delta` selectable rows, skipping headers and disabled rows. */
export function moveCursor(rows: readonly MenuRow[], from: number, delta: number): number {
  const spots = selectable(rows);
  if (spots.length === 0) return -1;
  const at = spots.indexOf(clampCursor(rows, from));
  const next = Math.min(Math.max(at + delta, 0), spots.length - 1);
  return spots[next];
}

/** First/last selectable row (for Home/End-style jumps). */
export function firstCursor(rows: readonly MenuRow[]): number {
  return clampCursor(rows, 0);
}

export function lastCursor(rows: readonly MenuRow[]): number {
  const spots = selectable(rows);
  return spots.length === 0 ? -1 : spots[spots.length - 1];
}

/** The row under an index (undefined when out of range). */
export function rowAt(view: MenuView, index: number): MenuRow | undefined {
  return view.rows[index];
}

/** Build a view with the cursor clamped and nudged off any header. */
export function buildView(title: string, rows: MenuRow[], cursor = 0): MenuView {
  return { title, rows, cursor: clampCursor(rows, cursor) };
}

/** Copy a view with a new cursor (clamped). */
export function withCursor(view: MenuView, cursor: number): MenuView {
  return { ...view, cursor: clampCursor(view.rows, cursor) };
}

/** The rows of a list, each mapped to a `choice` row with `on` on `active`. */
export function choiceRows(
  items: ReadonlyArray<{ id: string; label: string; value?: string; swatch?: number; icon?: string; disabled?: boolean }>,
  activeId: string,
): MenuRow[] {
  return items.map((it) => ({
    id: it.id,
    label: it.label,
    kind: 'choice' as const,
    on: it.id === activeId,
    ...(it.value !== undefined ? { value: it.value } : {}),
    ...(it.swatch !== undefined ? { swatch: it.swatch } : {}),
    ...(it.icon !== undefined ? { icon: it.icon } : {}),
    ...(it.disabled !== undefined ? { disabled: it.disabled } : {}),
  }));
}
