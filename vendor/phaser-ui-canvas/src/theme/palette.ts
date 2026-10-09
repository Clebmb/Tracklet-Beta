/**
 * palette — the colours a theme is made of, and nothing else.
 *
 * A theme is TWO things in the original codebase: the PANELS and their text,
 * and the APP's own marks drawn on top of the world. The framework only owns
 * the first — an app's overlays are the app's business — so a `UiTheme` here
 * is one palette, and apps that need more can attach their own via the theme's
 * `extras` slot (see themes.ts).
 *
 * The panel palette is split in two so a painter can be honest about how much
 * it needs:
 *
 *   PanelPalette  what it takes to draw a framed panel: fill, borders, trim.
 *   UiColors      that, plus the text and accent colours a full component
 *                 (a button, a slider row, a toast) draws with.
 *
 * The names are the original's, name for name: `stone` is the wet-stone
 * border, `ink` the near-black outline hugging every panel, `ward` the pale
 * violet trim, `ooze` the accent. Keeping them means the painters and the
 * shipped themes read the same as the game they were lifted from.
 */

/** The base named palette every shipped theme draws its hues from. */
export const BASE_COLORS = {
  nearBlack: 0x0a0a0f,
  charcoal: 0x1c1c24,
  bruisedPurple: 0x4a3459,
  diseasedGreen: 0x5f8f3e,
  toxicGreen: 0x7ec850,
  bone: 0xe8e0c9,
  rustRed: 0xa04a32,
  coldBlue: 0x4a7a9e,
} as const;

/** Exactly what it takes to draw one framed panel. */
export interface PanelPalette {
  /** The ink outline hugging the outside of the panel. */
  ink: number;
  /** The wet-stone border. */
  stone: number;
  /** The top-edge sheen on the border. */
  stoneHi: number;
  /** The panel interior fill. */
  panelFill: number;
  /** How solid the interior is (1 = nothing bleeds through). */
  panelFillAlpha: number;
  /** The pale ward trim and corner glints. */
  ward: number;
}

/** A full component palette: the panel colours plus text and accents. */
export interface UiColors extends PanelPalette {
  /** The accent: headings, the cursor, the live value, the selection band. */
  ooze: number;
  /** A dimmer accent, for secondary fills. */
  oozeDim: number;
  /** Primary body/label text. */
  textPrimary: number;
  /** Dim/secondary text, and disabled rows. */
  textDim: number;
  /** Accent text (a live value, a piece of ooze data). */
  textGreen: number;
  /** Destructive actions: rust, never a bright alarm red. */
  danger: number;
  /** The wordmark / title colour. */
  wordmark: number;
}

/**
 * The palette the framework ships with: "the reliquary" — an ancient stone
 * box contaminated by living ooze. Near-black navy panels framed in wet-stone
 * gray, murky green seeping through the seams and a bruised-violet ward glint
 * on the corners. This is the theme every shipped look was built around.
 */
export const DEFAULT_COLORS: UiColors = {
  panelFill: 0x06060d,
  panelFillAlpha: 1,
  stone: 0x333b4e,
  stoneHi: 0x4c5568,
  ink: BASE_COLORS.nearBlack,
  ooze: BASE_COLORS.toxicGreen,
  oozeDim: BASE_COLORS.diseasedGreen,
  ward: 0x9d84c9,
  textPrimary: 0xd9d3c3,
  textDim: 0x828a9b,
  textGreen: BASE_COLORS.toxicGreen,
  danger: BASE_COLORS.rustRed,
  wordmark: BASE_COLORS.toxicGreen,
};
