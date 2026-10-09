import type Phaser from 'phaser';
import type { NavEdge } from '../types';
import type { Rect } from '../types';

/**
 * MenuPage — one page of a menu: it owns its own display list and is destroyed
 * on page switch.
 *
 * A page is a `Container` plus an optional slice of the input loop. The
 * framework does not care what a page shows; a page that wants the keys
 * implements `handleEdge` and returns true for the edges it consumed. Opening
 * a category is the "lock on": while a focused page exists, it gets first
 * refusal on every edge, and a page that declines everything lets the sidebar
 * have them (up/down to pick another category, a second Escape to close).
 */
export interface MenuPage {
  /** The page's display list. The menu adds it to the scene. */
  readonly container: Phaser.GameObjects.Container;

  /** Called every frame while the page is active (subtle animation). */
  update?(timeMs: number, dtMs: number): void;

  /** Handle a navigation edge. Return true when consumed. */
  handleEdge?(edge: NavEdge): boolean;

  /** Take input back, backing out of any nested list on the way. */
  focus?(): void;

  /** Whether this page currently owns navigation. */
  hasFocus?(): boolean;

  /** Hand navigation back to the sidebar. */
  releaseFocus?(): void;

  destroy(): void;
}

/** Context handed to a page factory. */
export interface MenuPageContext {
  /** Ask the menu to repaint its chrome (a value changed). */
  onChange?: () => void;
  /** Extra app data, threaded through untouched. */
  [key: string]: unknown;
}

/** Build a page inside the given content rectangle. */
export type MenuPageFactory = (
  scene: Phaser.Scene,
  rect: Rect,
  ctx: MenuPageContext,
) => MenuPage;

/** One entry of a data-driven category list (the sidebar). */
export interface MenuCategory {
  id: string;
  /** Sidebar label. */
  displayLabel: string;
  /** Optional registered icon name. */
  icon?: string;
  /** The page this category opens. */
  page: MenuPageFactory;
  /** A greyed category the cursor skips. */
  enabled: boolean;
}
