/**
 * What a key means while a menu is open.
 *
 * The three menus (F1/F2/F9) all take the same keys, and they have to keep
 * taking them: a modal you can only drive with the mouse is a modal a beginner
 * gets stuck in. Keeping the mapping in ONE table means "WASD works" is a
 * property of the app rather than a thing each menu remembers to do.
 *
 * ── Why WASD is fine here and nowhere else ────────────────────────────────────
 * `W A S D` are piano keys in Tracklet — that is why `MenuInputController` is
 * built without them and why the scene's own bindings never see them. Inside a
 * menu that whole keyboard is dead anyway: the scene routes every key to the
 * open menu and returns before the piano is consulted, so `A` cannot sound a
 * note through the curtain. The one place WASD is unambiguous is the one place
 * it is safe, so it is offered exactly there.
 *
 * Left/Right are aliases of Up/Down because every menu here is a single column
 * of rows: a horizontal nudge meaning "the next one" is friendlier than nothing,
 * and it keeps the two spinners (theme list, file list) identical.
 */

/** A move, a jump, a choice, or a way out. */
export type MenuIntent = 'up' | 'down' | 'first' | 'last' | 'pick' | 'close';

/** The `KeyboardEvent.code` values each intent answers to. */
const INTENTS: Readonly<Record<MenuIntent, readonly string[]>> = {
  up: ['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA'],
  down: ['ArrowDown', 'ArrowRight', 'KeyS', 'KeyD'],
  first: ['Home'],
  last: ['End'],
  pick: ['Enter', 'NumpadEnter', 'Space'],
  close: ['Escape'],
};

/**
 * The intent a key carries inside a menu, or `null` if the menu should ignore it.
 *
 * A lookup rather than a `switch` so a test can enumerate both directions: that
 * every key the help screen promises works, and that no OTHER key sneaks in. A
 * menu that swallowed `Z` or `Q` would break note-writing for the one user who
 * opened a menu mid-bar.
 */
const BY_CODE: ReadonlyMap<string, MenuIntent> = new Map(
  Object.entries(INTENTS).flatMap(([intent, codes]) =>
    codes.map((code) => [code, intent as MenuIntent] as const),
  ),
);

export function menuIntent(code: string): MenuIntent | null {
  return BY_CODE.get(code) ?? null;
}

/** Every key the menus answer to, for the help screen and for tests. */
export const MENU_KEY_CODES: readonly string[] = [...BY_CODE.keys()];
