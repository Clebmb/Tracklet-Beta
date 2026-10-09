/**
 * phaser-ui-canvas — a reusable, themeable in-canvas UI framework for Phaser 4.
 *
 * Everything is drawn with Phaser itself (Graphics + Text + Container + input
 * zones) at the app's internal resolution, so it stays pixel-crisp under the
 * canvas's nearest-neighbour upscaling and needs no DOM, no React and no HTML.
 *
 * Three ways to use it, in increasing order of commitment:
 *
 *   1. Function-level. Import a painter or a model directly:
 *        import { drawPanel, uiText } from 'phaser-ui-canvas/styles';
 *        import { clampCursor } from 'phaser-ui-canvas/menus';
 *
 *   2. Component-level. Import only the controls you want:
 *        import { Window, Slider } from 'phaser-ui-canvas/components';
 *
 *   3. Framework-level. Initialize once and let it install the theme + input:
 *        import { initializeUi } from 'phaser-ui-canvas';
 *        const ui = initializeUi({ theme: 'reliquary' });
 *        await ui.ready;
 *
 * Nothing here reaches outside the framework: there is no game, no store and
 * no app state in this package.
 */

import Phaser from 'phaser';
import { DEFAULT_THEME_ID, activeTheme, setActiveTheme, THEMES } from './theme/themes';
import { DEFAULT_FACES, whenFontsReady } from './utils/fonts';
import { MenuInputController, type MenuInputConfig } from './input/MenuInputController';

// --- initializer -----------------------------------------------------------

export interface UiFrameworkConfig {
  /** Theme id to start on. Defaults to the shipped theme. */
  theme?: string;
  /**
   * Font shorthand specs to await before drawing text. Defaults to the
   * framework's own pair. Pass `[]` to skip waiting.
   */
  fonts?: readonly string[];
  /** Await fonts (default true). */
  awaitFonts?: boolean;
  /** How long to wait for fonts before drawing anyway (ms). */
  fontsTimeoutMs?: number;
}

/** The handle `initializeUi` returns. */
export interface UiFramework {
  /** The active theme id. */
  readonly theme: string;
  /** Switch theme; the same as `setActiveTheme(id)`. */
  setTheme(id: string): void;
  /** Resolves once fonts are ready (or the wait timed out). */
  readonly ready: Promise<void>;
  /** Create a menu input controller wired to a scene, with defaults filled in. */
  input(scene: Phaser.Scene, config?: MenuInputConfig): MenuInputController;
  /** The Phaser game config this framework recommends for crisp pixel UI. */
  gameConfig(width: number, height: number, overrides?: UiGameConfigOverrides): Phaser.Types.Core.GameConfig;
}

export type UiGameConfigOverrides = Partial<Phaser.Types.Core.GameConfig>;

/**
 * Initialize the framework: set the active theme and (optionally) wait for the
 * pixel fonts. Safe to call more than once; the last call wins the theme.
 *
 * This is deliberately the ONLY function that touches global state, so an app
 * that prefers to import painters directly never has to call it.
 */
export function initializeUi(config: UiFrameworkConfig = {}): UiFramework {
  const themeId = config.theme ?? DEFAULT_THEME_ID;
  setActiveTheme(themeId);

  const ready = config.awaitFonts === false
    ? Promise.resolve()
    : whenFontsReady(config.fonts ?? DEFAULT_FACES, config.fontsTimeoutMs ?? 2500);

  return {
    get theme() { return activeTheme().id; },
    setTheme: (id: string) => { setActiveTheme(id); },
    ready,
    input: (scene: Phaser.Scene, inputConfig?: MenuInputConfig) =>
      new MenuInputController(scene, inputConfig),
    gameConfig: createGameConfig,
  };
}

/**
 * A Phaser 4 game config tuned for this framework: WebGL, no texture
 * antialiasing and `roundPixels` ON (Phaser 4 defaults it off, which softens
 * pixel-drawn UI), fitted and centred in its parent.
 *
 * `overrides` are merged shallowly OVER this, so a caller can change anything.
 */
export function createGameConfig(
  width: number,
  height: number,
  overrides: UiGameConfigOverrides = {},
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.WEBGL,
    width,
    height,
    backgroundColor: '#0a0a0f',
    antialias: false,
    roundPixels: true,
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    ...overrides,
  };
}

// --- re-exports ------------------------------------------------------------

export * from './types';
export * from './theme';
export * from './styles';
export * from './layout';
export * from './input';
export * from './menus';
export * from './components';
export * from './windows';
export * from './models';
export * from './utils';

/** The shipped theme ids, for convenience. */
export const THEME_IDS: readonly string[] = THEMES.map((t) => t.id);
