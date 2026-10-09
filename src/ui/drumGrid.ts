/**
 * drumGrid — the arithmetic behind the drum machine's pad × step grid.
 *
 * The view itself is pixels, and pixels are the one thing here a headless test
 * cannot check. What it CAN check — and what is easy to get subtly wrong — is
 * everything about the grid that is not a pixel: how many steps fit, which window
 * of them the cursor is in, which step a column names, and what a hit's velocity
 * does when you click it. So that lives here, pure and tested, and the view is
 * left with the drawing.
 *
 * ── Why a WINDOW and not a wider cell ────────────────────────────────────────
 * A machine may have up to 64 steps and a cell has to stay big enough to click
 * (about nine pixels). Sixty-four of those do not fit in the grid's width, so the
 * grid shows as many as fit and follows the cursor — the same bargain the pattern
 * grid makes down the rows and the piano roll makes across the columns. The
 * window is DERIVED from the cursor rather than remembered, so a view can never
 * draw a window the cursor is not in.
 */

/** The steps the grid is showing: the first one, and how many. */
export interface DrumGridWindow {
  /** The first step drawn, 0-based. */
  first: number;
  /** How many steps are drawn. Never more than the machine has. */
  visible: number;
}

/**
 * How many steps fit in `capacity` cells, never more than the machine has.
 *
 * A machine with fewer steps than the grid can hold draws only its own, so a
 * sixteen-step machine is sixteen cells rather than sixteen lit ones and a wall of
 * empty ones.
 */
export function visibleSteps(steps: number, capacity: number): number {
  const size = Math.max(1, Math.round(steps));
  const room = Math.max(1, Math.round(capacity));
  return Math.min(size, room);
}

/**
 * The window of steps that contains the cursor.
 *
 * The cursor is centred where it can be and pinned to an end where it cannot, so
 * a person walking left from the middle scrolls, and one walking off the left edge
 * simply stops at the wall rather than the grid drifting past them.
 */
export function drumGridWindow(steps: number, cursor: number, capacity: number): DrumGridWindow {
  const visible = visibleSteps(steps, capacity);
  const last = visible - 1;
  const at = Math.max(0, Math.min(Math.max(0, Math.round(steps) - 1), Math.round(cursor)));
  const maxFirst = Math.max(0, Math.max(1, Math.round(steps)) - visible);
  const first = Math.max(0, Math.min(maxFirst, at - Math.floor(last / 2)));
  return { first, visible };
}

/** The step a column of the window plays, or null for a column past the end. */
export function stepAtColumn(window: DrumGridWindow, column: number): number | null {
  if (column < 0 || column >= window.visible) return null;
  return window.first + column;
}

/** The column a step sits in inside the window, or -1 when it is scrolled off. */
export function columnOfStep(window: DrumGridWindow, step: number): number {
  const column = step - window.first;
  return column >= 0 && column < window.visible ? column : -1;
}

/** A hit's velocity, 0..100. The four a click cycles through, soft to full. */
export const HIT_VELOCITIES: readonly number[] = [0, 40, 70, 100];

/** What a click on an empty cell writes: a full hit, because a hit is the point. */
export const DEFAULT_HIT_VELOCITY = 100;

/**
 * The hit a plain click makes: an empty cell becomes a full hit, a lit one rests.
 *
 * Toggle rather than cycle, because drawing a beat is mostly two decisions — "a
 * hit here" and "not a hit here" — and a control that crept through four levels on
 * the way to a rest would make the common edit the slow one. The velocities are a
 * SECOND press (`nextHitVelocity`) or a right-click, where they belong.
 */
export function toggleHitVelocity(velocity: number): number {
  return velocity > 0 ? 0 : DEFAULT_HIT_VELOCITY;
}

/**
 * The next velocity up the ladder, wrapping round to a rest.
 *
 * The click that walks it is the right one, so the four levels are one gesture
 * away and the loudest is a further press from a rest rather than a return trip.
 */
export function nextHitVelocity(velocity: number): number {
  const current = Math.max(0, Math.min(100, Math.round(velocity)));
  const at = HIT_VELOCITIES.findIndex((step) => step >= current);
  const from = at < 0 ? HIT_VELOCITIES.length - 1 : at;
  return HIT_VELOCITIES[(from + 1) % HIT_VELOCITIES.length] ?? 0;
}

/** The previous velocity, so both directions of the ladder exist for a nudge key. */
export function previousHitVelocity(velocity: number): number {
  const current = Math.max(0, Math.min(100, Math.round(velocity)));
  let at = 0;
  for (let i = 0; i < HIT_VELOCITIES.length; i++) {
    if ((HIT_VELOCITIES[i] ?? 0) <= current) at = i;
  }
  return HIT_VELOCITIES[(at - 1 + HIT_VELOCITIES.length) % HIT_VELOCITIES.length] ?? 0;
}

/**
 * How bright a lit cell is drawn, 0..1, from its velocity.
 *
 * A row of hits reads as a rhythm because the loud ones are brighter, which is
 * the whole reason the row is numbers rather than booleans. A rest answers zero
 * and the caller draws its own empty cell.
 */
export function hitShade(velocity: number): number {
  const amount = Math.max(0, Math.min(100, velocity));
  return amount <= 0 ? 0 : 0.35 + 0.65 * (amount / 100);
}
