/**
 * hit — hit-testing a set of named rectangles.
 *
 * A toolbar, a list of rows and a tab strip are all the same question: which
 * region is under this point? Regions are tested last-first so the region
 * drawn on top (added last) wins, which matches what the eye expects.
 */

import type { Rect } from '../types';
import { inside } from './rect';

export interface HitRegion<T> {
  id: T;
  rect: Rect;
  /** When false, the region is skipped (drawn but not interactive). */
  enabled?: boolean;
}

/** The topmost enabled region containing the point, or null. */
export function hitRegion<T>(
  regions: readonly HitRegion<T>[], x: number, y: number,
): HitRegion<T> | null {
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    if (r.enabled === false) continue;
    if (inside(r.rect, x, y)) return r;
  }
  return null;
}

/** The id of the topmost enabled region containing the point, or null. */
export function hitTest<T>(
  regions: readonly HitRegion<T>[], x: number, y: number,
): T | null {
  return hitRegion(regions, x, y)?.id ?? null;
}

/** True when the point is inside ANY enabled region. */
export function hitsAny<T>(
  regions: readonly HitRegion<T>[], x: number, y: number,
): boolean {
  return hitRegion(regions, x, y) !== null;
}
