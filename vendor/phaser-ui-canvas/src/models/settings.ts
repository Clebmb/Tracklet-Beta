/**
 * settings — option rows and the rules for changing them, as pure functions.
 *
 * The original settings screen had one list, one step size, one clamp and one
 * set of labels, shared by two screens so they could not drift apart. This is
 * that list, made generic: a row is a `volume` (a number nudged in notches) or
 * a `toggle` (on/off). An app supplies its own rows and reads its own store;
 * the ARITHMETIC is the framework's, so it is the same everywhere and testable.
 *
 * Phaser-free on purpose.
 */

/** A row's behaviour: a stepped number, or a boolean. */
export type OptionKind = 'volume' | 'toggle';

export interface OptionRow {
  /** The app's own key for what this row reads and writes. */
  id: string;
  label: string;
  kind: OptionKind;
  /** Optional group heading (rows are drawn in list order). */
  group?: string;
}

export type OptionValue = number | boolean;

/** One notch of a volume. */
export const VOLUME_STEP = 0.1;

/**
 * Row pitch for an options list, in the UI's 8px text grid. The original kept
 * this ONE number in one place because two screens drew the same list and
 * would otherwise drift.
 */
export const OPTIONS_ROW_H = 11;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Round to the notch grid (0.1), so repeated steps never drift to 0.7000001. */
const notch = (v: number): number => Math.round(v * 10) / 10;

export function formatPercent(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

/** How many of `cells` light up for a 0..1 volume (for a bar read-out). */
export function litCells(value: number, cells: number): number {
  return Math.round(clamp01(value) * cells);
}

/** The text a row shows for its value. */
export function formatOptionValue(row: OptionRow, value: OptionValue): string {
  return row.kind === 'volume' ? formatPercent(Number(value)) : (value ? 'ON' : 'OFF');
}

/**
 * LEFT/RIGHT on a row: volumes move one notch and stop at the ends (a slider
 * that wraps under a held direction is a slider you cannot set), toggles flip
 * whichever way you press — a two-state value has nowhere else to go.
 */
export function adjustOption(
  row: OptionRow, value: OptionValue, dir: 'left' | 'right',
): OptionValue {
  if (row.kind !== 'volume') return !value;
  const sign = dir === 'right' ? 1 : -1;
  return clamp01(notch(Number(value) + sign * VOLUME_STEP));
}

/**
 * ENTER/click on a row: toggles flip, volumes step up and WRAP to silence past
 * the top — otherwise a keyboard-only user could turn a slider up but never
 * back down from the menu's confirm action.
 */
export function activateOption(row: OptionRow, value: OptionValue): OptionValue {
  if (row.kind !== 'volume') return !value;
  const next = notch(Number(value) + VOLUME_STEP);
  return next > 1 ? 0 : clamp01(next);
}

/** All rows' display strings, in list order. */
export function optionValueLabels(
  rows: readonly OptionRow[],
  read: (row: OptionRow) => OptionValue,
): string[] {
  return rows.map((row) => formatOptionValue(row, read(row)));
}
