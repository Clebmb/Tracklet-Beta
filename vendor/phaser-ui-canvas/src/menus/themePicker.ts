/**
 * themePicker — the built-in "choose a theme" menu, as data.
 *
 * Because "theme switching" is a feature of the framework, the framework also
 * ships the menu that drives it, so an app gets the picker for free. It is
 * just a `MenuView`: one `choice` row per theme, `on` on the active one. Wire
 * it to a `MenuListPanel` and call `applyThemeRow` when a row is activated.
 */

import type { MenuRow } from './model';
import { THEMES, activeTheme, setActiveTheme, themeById } from '../theme/themes';

/** The theme ids, in picker order. */
export function themeIds(): string[] {
  return THEMES.map((t) => t.id);
}

/** A row id names its theme: `theme:<id>`. */
export function themeRowId(id: string): string {
  return `theme:${id}`;
}

/** The theme id a row would apply, or null for a non-theme row. */
export function themeIdFromRow(row: MenuRow): string | null {
  return row.id.startsWith('theme:') ? row.id.slice('theme:'.length) : null;
}

/** One `choice` row per theme, with the active one marked. */
export function themeMenuRows(activeId: string = activeTheme().id): MenuRow[] {
  return THEMES.map((t) => ({
    id: themeRowId(t.id),
    label: t.name,
    kind: 'choice' as const,
    on: t.id === activeId,
    value: t.id === activeId ? 'ON' : undefined,
    data: { themeId: t.id },
  }));
}

/**
 * Apply the theme a row names. Returns true when a theme changed, so callers
 * know to rebuild their chrome. Rows that are not theme rows are ignored.
 */
export function applyThemeRow(row: MenuRow): boolean {
  const id = themeIdFromRow(row);
  if (!id) return false;
  if (themeById(id).id === activeTheme().id) return false;
  setActiveTheme(id);
  return true;
}
