/**
 * launch — being opened BY another app, and knowing how to get back to it.
 *
 * The kit's editors are separate apps, so opening one is a navigation, and the
 * launcher hands over three query parameters on the way:
 *
 *   from=<launcher>   who opened this app, so it can tell "I was launched from
 *                     the kit" from "somebody opened my URL directly".
 *   host=<url>        where to go back to. Passed rather than derived: in
 *                     development the two apps are on different ports, so there
 *                     is nothing about `location` that names the launcher.
 *   theme=<id>        the look the launcher wants this app in.
 *
 * ── Two pairs, and they do not travel together ───────────────────────────────
 *
 * `from` and `host` are about LEAVING: they are the way out, and they are
 * OMITTED when the launcher did not give up its own tab — a launcher that opens
 * this app in a NEW tab is still sitting there behind it, so there is nothing to
 * go back to and no way out worth offering. That is why a missing `from` means
 * "nobody launched me" rather than "a launcher that forgot", and it is the whole
 * of the difference between the two launch modes.
 *
 * `theme` is about ARRIVING, so it travels in BOTH modes. How an app should look
 * does not depend on whether anybody is waiting behind it.
 *
 * Which is why there are TWO readers here, and why they are separate. `readLaunch`
 * answers "was I launched, and by whom" — the door question — and it is null for a
 * new-tab launch, correctly: nobody is behind you, so there is no way out to
 * offer. `readLaunchTheme` answers "what look was I asked for", which is a
 * different question with a different answer, and reading the theme out of
 * `readLaunch` was a bug: a new-tab launch has no `from`, so the theme the
 * launcher HAD sent was thrown away, and the app silently opened in whatever it
 * last remembered. One call, two questions, and the one that is null in a whole
 * launch mode is not the one that carries the look.
 *
 * ── Why the theme is passed at all ───────────────────────────────────────────
 *
 * Because `localStorage` is per ORIGIN, and in development every app is its own
 * port — so the menu on `localhost:5400` and an editor on `localhost:5200` have
 * completely separate storage, and a launcher that writes "your theme is X" into
 * the editor's key is writing into a storage the editor will never read. (In a
 * build the whole kit shares one origin under different subpaths, and the same
 * write lands where it is read — which is why this needs saying out loud rather
 * than being a bug anybody notices in a build.) The URL is the only thing that
 * crosses an origin boundary, so it is where a choice that has to survive the
 * crossing goes.
 *
 * The id here is NOT validated, deliberately. A theme list belongs to whatever
 * set the themes, and this module's business is the shape of a launch, not which
 * looks exist — the caller ignores an id it does not know exactly as it ignores
 * an unknown one from its own storage.
 *
 * This file is Phaser-free and `location`-free — it parses a string the caller
 * hands it — so the contract can be unit tested without a browser, and so the
 * framework stays honest about knowing nothing except what it is told.
 */

/** The parameter naming the app that launched this one. */
export const FROM_PARAM = 'from';
/** The parameter carrying the way back. */
export const HOST_PARAM = 'host';
/** The parameter carrying the look the launcher wants this app in. */
export const THEME_PARAM = 'theme';

export interface HostLaunch {
  /** The launcher, as it named itself. */
  from: string;
  /** Where "go back" goes; null when the launcher did not say. */
  host: string | null;
  /** The theme to open in; null when the launcher named none. */
  theme: string | null;
}

/**
 * Read a location's `search` string. Returns null when this app was not
 * launched by anything — which is the answer for a directly-opened URL, and the
 * reason an app can offer "exit to the kit" only when it is true.
 *
 * A launch is identified by `from`, and by nothing else: a URL with only a theme
 * on it was not launched by anybody, it was typed.
 *
 * `expected` names the launcher to accept. Pass null (the default) to accept any
 * launcher that identifies itself, which is what a framework can honestly do: it
 * has no business knowing the kit's name.
 */
export function readLaunch(search: string, expected: string | null = null): HostLaunch | null {
  const params = queryOf(search);
  const from = params.get(FROM_PARAM);
  if (from === null || from.length === 0) return null;
  if (expected !== null && from !== expected) return null;
  const host = params.get(HOST_PARAM);
  const theme = params.get(THEME_PARAM);
  return {
    from,
    host: host !== null && host.length > 0 ? host : null,
    theme: theme !== null && theme.length > 0 ? theme : null,
  };
}

/**
 * The look a URL asks this app to open in, or null when it asks for none.
 *
 * NOT a field of `readLaunch`, and that is the point. `readLaunch` is the door
 * question, and it answers null for a launch that is not a handover — a new tab,
 * where the launcher keeps its own page and sends no `from` because there is
 * nothing to go back to. But the launcher still sends the theme in that mode,
 * deliberately, and the theme is the only thing that has to cross an origin
 * boundary to get here (see the module comment). Reading it out of `readLaunch`
 * threw it away in exactly the mode where the URL is the only channel that can
 * carry it, so an editor opened in a new tab came up in whatever theme it last
 * remembered instead of the one the kit is set to.
 *
 * So: two readers, two questions. "Was anybody waiting behind me?" and "what
 * should I look like?" have different answers and neither one implies the other.
 *
 * The id is not validated here, for the same reason `readLaunch` does not
 * validate it: a theme list belongs to whatever app asked for the theme.
 */
export function readLaunchTheme(search: string): string | null {
  const theme = queryOf(search).get(THEME_PARAM);
  return theme !== null && theme.length > 0 ? theme : null;
}

/** A location's `search`, with or without its leading mark. */
function queryOf(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

/**
 * The way back to the launcher: its URL when it gave one, and otherwise the
 * previous entry in this tab's history — which is the launcher itself when the
 * two were navigated between, and the best available guess when they were not.
 */
export function hostBackUrl(launch: HostLaunch): string | null {
  return launch.host;
}
