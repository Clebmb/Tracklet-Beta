/**
 * pages — the full screens the app can show, by name.
 *
 * The SCREENS live in the UI (`src/ui/PageMenu.ts` owns the dropdown and the
 * `PageId` type), but the parser has to validate `page arranger` without the
 * model reaching into Phaser — the same problem `themeNames.ts` solves for the
 * looks. So this file is the MIRROR: the ids the language accepts, written
 * exactly as a script spells them, with the view importing the type back from
 * here rather than keeping a second list that could drift.
 *
 * The list holds only the pages THIS build can actually show. That is
 * deliberate and is what makes an old build refuse a page it was never taught:
 * a build before LIVE does not list `live`, so `page live` is refused in words
 * rather than switching to a screen that does not exist. Landing a page means
 * adding its name here, its row to the dropdown, and (if it is new language) a
 * version note — the same trio every feature in this project keeps.
 */

/** The ids of every page, in the order the dropdown shows them. */
export const PAGE_NAMES = ['tracker', 'machine', 'mixer', 'arranger', 'arp', 'live', 'recorder'] as const;

/** One page id, as the language and the dropdown both spell it. */
export type PageName = (typeof PAGE_NAMES)[number];

/** True when a word names a page a script may switch to. */
export function isPageName(text: string): boolean {
  return (PAGE_NAMES as readonly string[]).includes(text.trim().toLowerCase());
}

/** The list as an author reads it, for an error message that teaches. */
export function pageNameHint(): string {
  return `Pages: ${PAGE_NAMES.join(', ')}.`;
}
