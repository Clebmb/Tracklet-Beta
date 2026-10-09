/**
 * controls — a "controls help" card, as data and column arithmetic.
 *
 * The original editor had an F1 controls list that had to fit a fixed card;
 * the interesting part is not the keys (the app's business) but the LAYOUT:
 * sections, kept whole, split into balanced columns by HEIGHT rather than by
 * line count. The framework ships the arithmetic and the shapes; an app
 * supplies its own sections.
 *
 * Phaser-free on purpose.
 */

export interface ControlRow {
  /** The key(s), as printed in the left field (e.g. `SHIFT+W/S`). */
  keys: string;
  /** What it does, in one line. */
  action: string;
}

export interface ControlSection {
  title: string;
  rows: ControlRow[];
}

/** Lines a section takes: its heading, then one per row. */
export function sectionLines(section: ControlSection): number {
  return 1 + section.rows.length;
}

/** How many lines a list of sections prints. */
export function controlsLines(sections: readonly ControlSection[]): number {
  return sections.reduce((n, s) => n + sectionLines(s), 0);
}

/**
 * The tallest column of a candidate split — the thing that actually has to fit
 * a fixed-height card. Sections are the unit, never rows: a section split
 * across the gap would put its heading at the foot of one column and its rows
 * at the top of the next.
 */
function splitOnce(
  sections: readonly ControlSection[],
): [ControlSection[], ControlSection[]] {
  let best: [ControlSection[], ControlSection[]] = [[], sections.slice()];
  let bestTallest = controlsLines(sections);
  for (let i = 1; i < sections.length; i++) {
    const left = sections.slice(0, i);
    const right = sections.slice(i);
    const tallest = Math.max(controlsLines(left), controlsLines(right));
    if (tallest < bestTallest) {
      bestTallest = tallest;
      best = [left, right];
    }
  }
  return best;
}

/**
 * Split sections into `columns` balanced columns, in order. Two is the common
 * card; a recursive cut of the same rule handles any other count, so a future
 * three-column card is balanced by the same idea rather than a second
 * implementation of it.
 */
export function controlsColumns(
  sections: readonly ControlSection[], columns = 2,
): ControlSection[][] {
  if (columns <= 1) return [sections.slice()];
  const [left, right] = splitOnce(sections);
  if (columns === 2) return [left, right];
  const half = Math.floor(columns / 2);
  return [...controlsColumns(left, half), ...controlsColumns(right, columns - half)];
}
