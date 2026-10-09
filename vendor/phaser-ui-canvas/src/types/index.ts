/**
 * types — the framework's shared, Phaser-free vocabulary.
 *
 * Everything here is a plain data shape so it can be imported by scene code,
 * by pure models and by unit tests without dragging Phaser in. Anything that
 * needs a Phaser object (a Graphics, a Scene) lives beside the code that uses
 * it, not here.
 */

/** An axis-aligned rectangle in canvas pixels (top-left origin). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a navigation event came from. */
export type InputSource = 'keyboard' | 'gamepad';

/** The four directions the cursor can travel. */
export type NavDir = 'up' | 'down' | 'left' | 'right';

/**
 * What a discrete navigation event means.
 * - `confirm`   the primary action (Enter / pad A)
 * - `cancel`    back out (Esc / pad B)
 * - `pause`     open/close (pad Start)
 * - `page`      cycle a page/tab (`pageDir` says which way)
 * - `action`    a caller-bound extra key (the default is F)
 * - `dir`       a direction press (see `dir`)
 */
export type NavAction = 'confirm' | 'cancel' | 'pause' | 'page' | 'action' | 'dir';

/** Which way a `page` event flips. */
export type NavPageDir = 'next' | 'prev';

/**
 * One discrete navigation event. Edge-triggered: a press produces exactly one
 * edge, and holding a direction re-fires on the repeat cadence with
 * `repeated: true`.
 */
export interface NavEdge {
  action: NavAction;
  /** Set for `action: 'dir'`. */
  dir?: NavDir;
  /** Set for `action: 'page'`. */
  pageDir?: NavPageDir;
  source: InputSource;
  /** True when produced by the hold-repeat cadence rather than a fresh press. */
  repeated?: boolean;
  /** Set for `action: 'action'`: which bound action fired. */
  name?: string;
}
