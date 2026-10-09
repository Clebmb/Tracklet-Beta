import Phaser from 'phaser';
import { initializeUi, THEME_IDS } from 'phaser-ui-canvas';
import { readLaunchTheme } from 'phaser-ui-canvas/host';
import { TrackerScene } from './scenes/TrackerScene';
import { instrumentCatalog } from './model/catalog';
import { scriptCapabilities } from './model/capabilities';
import { pickStoredTheme, rememberTheme } from './themePrefs';

/**
 * The whole boot, in the framework's recommended three steps: pick a theme,
 * wait for the pixel fonts (so the first frame never rasterizes in a fallback
 * face), then start Phaser with the framework's crisp-pixel game config.
 *
 * The theme is whichever of three answers was chosen most recently; `bootTheme`
 * below is the whole of that, and `undefined` means "whatever the framework
 * ships as default". A theme id that names nothing (an older build, a hand-edited
 * key, a launcher asking for a look that no longer exists) is ignored rather
 * than handed to `setActiveTheme`, which would "work" — it falls back — and
 * leave the app disagreeing with itself about which theme is on.
 *
 * The last two faces are Tracklet's own: 'Daydream' draws the header wordmark
 * and 'Maze' draws the display headings. The framework only awaits its own pair
 * by default, so both are listed here too - a wordmark rasterized in the
 * fallback face is exactly the flash we are avoiding.
 *
 * The spec names a family AT A SIZE, and that is deliberate: what has to be
 * ready is the face at the size it will be drawn, because a Phaser Text measures
 * itself on creation and a wrong measurement moves everything placed after it.
 */
/**
 * The look Tracklet opens in.
 *
 * The LAUNCHER's choice comes first, because that is master control's "default
 * theme for the whole kit" — and in development a launch is the only way it can
 * arrive: every app here is its own port, so each is its own origin and its own
 * `localStorage`, and the key the Doodadarium mirrors a theme into is in the
 * Doodadarium's storage rather than Tracklet's (see `phaser-ui-canvas/host`).
 * It is then written down as Tracklet's OWN preference, so the look the kit
 * picked survives opening Tracklet on its own.
 *
 * The launcher is deliberately not NAMED here. A door is the kit's business —
 * only the Doodadarium gets to offer one — but a look is not: an app asked to
 * open in a theme it knows simply opens in it. Either way the id is checked
 * against the real themes, so neither a URL nor a stale stored value can put the
 * tracker into a look that does not exist.
 *
 * Read with `readLaunchTheme` rather than out of `readLaunch`, because a door and
 * a look are two different questions. A launch into a NEW TAB sends no `from` —
 * there is nobody behind it to go back to — so `readLaunch` is null for a whole
 * launch mode, while the theme is sent in both. Asking the door question to find
 * the look meant the tracker opened in whatever it last remembered.
 */
function bootTheme(): string | undefined {
  const handed = readLaunchTheme(window.location.search);
  if (handed !== null && THEME_IDS.includes(handed)) {
    rememberTheme(handed, THEME_IDS);
    return handed;
  }
  return pickStoredTheme(THEME_IDS) ?? undefined;
}

const ui = initializeUi({
  theme: bootTheme(),
  fonts: ['8px Silkscreen', '8px Alagard', '16px Daydream', '12px Maze'],
});

ui.ready.then(() => {
  const game = new Phaser.Game(ui.gameConfig(720, 405, {
    parent: 'game',
    scene: [TrackerScene],
    backgroundColor: '#05050a',
  }));

  if (import.meta.env.DEV) {
    // The dev hook an agent (or a curious person) reads: the game, plus the whole
    // instrument vocabulary as data, so "what voices are there?" is a question
    // answered by the running app rather than by guessing a file path.
    //
    // `capabilities` is the other half of that question, and the more important
    // half for something that has to WRITE a song: which commands this build
    // understands (`keywords`, one tested `example` each, `tiers` to choose a
    // depth), what every limit is, and the closed lists a word may come from.
    // It is the reason an agent can ask the build in front of it what it speaks
    // instead of trusting a reference that may be older than the code.
    const hook = game as unknown as { catalog: unknown; capabilities: unknown };
    hook.catalog = instrumentCatalog();
    hook.capabilities = scriptCapabilities();
    (window as unknown as Record<string, unknown>).__tracklet = game;
  }
});
