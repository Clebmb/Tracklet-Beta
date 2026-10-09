import { mix, type UiColors } from 'phaser-ui-canvas';

/**
 * The colour that identifies a channel, everywhere it appears.
 *
 * It is drawn from the ACTIVE theme's own accents rather than a hard-coded
 * palette, so a channel chip in the track list and that channel's notes in the
 * pattern grid always agree, and both keep working when the theme changes —
 * including on the light `parchment` theme, whose accents are dark-on-light.
 *
 * The theme only exposes a handful of accents, and two of them are often the
 * SAME colour (`ooze` and `textGreen` in the shipped reliquary), so the last
 * four entries are blends. That is what keeps an eight-track song readable
 * instead of cycling green, green, purple, green.
 */
export function trackColor(index: number, c: UiColors): number {
  const palette = [
    c.ooze,
    c.ward,
    c.danger,
    c.textPrimary,
    mix(c.ooze, c.ward, 0.5),
    mix(c.ward, c.danger, 0.5),
    mix(c.ooze, c.danger, 0.5),
    mix(c.textPrimary, c.ward, 0.5),
  ];
  return palette[index % palette.length];
}
