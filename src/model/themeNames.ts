/**
 * themeNames — the ten looks the app can wear, by name.
 *
 * The FRAMEWORK owns the themes (`THEMES` / `THEME_IDS` in `phaser-ui-canvas`),
 * and a `Song` must never depend on a drawing library, so this file is a MIRROR
 * rather than a re-export: the parser can validate `theme forge` without the
 * model reaching into Phaser. A test pins the two lists together, so the mirror
 * cannot silently fall behind the thing it mirrors — the only failure mode that
 * would matter, since a stale list would refuse a theme that exists and hide it
 * from the error message that is supposed to teach it.
 *
 * The ids are the framework's, written exactly as `setActiveTheme` wants them
 * (`the-deep`, not `THE DEEP`): a script is hand-typed, so it should take the
 * same word the code does, and the display name — with its space and capitals —
 * is a thing to read off the menu, not to spell.
 */

/** The ids of every built-in theme, in the framework's own order. */
export const THEME_NAMES: readonly string[] = [
  'reliquary',
  'moorland',
  'the-deep',
  'ossuary',
  'underglow',
  'forge',
  'mycelium',
  'boghollow',
  'nest',
  'parchment',
];

/** True when a word names a theme a script may switch to. */
export function isThemeName(text: string): boolean {
  return THEME_NAMES.includes(text.trim().toLowerCase());
}

/** The list as an author reads it, for an error message that teaches. */
export function themeNameHint(): string {
  return `Themes: ${THEME_NAMES.join(', ')}.`;
}
