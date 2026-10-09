import { describe, expect, it } from 'vitest';

// The framework's theme list, imported BY PATH rather than through the app's
// `phaser-ui-canvas` alias: `themes.ts` is Phaser-free on purpose (its own
// header says so, and the framework tests it the same way), and the point of
// this import is to hold the REAL palettes to account rather than to prove the
// app can talk to the framework.
import { THEMES } from '../../vendor/phaser-ui-canvas/src/theme/themes';

import {
  CONTRAST_AA,
  CONTRAST_AA_LARGE,
  CONTRAST_AAA,
  CONTRAST_GRADE_BLURB,
  contrastGrade,
  contrastRatio,
  contrastReading,
  formatContrast,
  isBodyTextLegible,
  relativeLuminance,
} from '../ui/contrast';

/**
 * contrast — the arithmetic under \"is this theme readable?\", and the guard that
 * keeps a shipped palette from going illegible without anyone noticing.
 */

describe('the contrast arithmetic', () => {
  it('is 21:1 for black on white and 1:1 for a colour against itself', () => {
    expect(contrastRatio(0xffffff, 0x000000)).toBeCloseTo(21, 5);
    expect(contrastRatio(0x000000, 0xffffff)).toBeCloseTo(21, 5);
    expect(contrastRatio(0xd9d3c3, 0xd9d3c3)).toBeCloseTo(1, 10);
  });

  it('does not care which of the two is the brighter', () => {
    expect(contrastRatio(0x123456, 0xeeeedd)).toBeCloseTo(contrastRatio(0xeeeedd, 0x123456), 10);
  });

  it('luminance runs 0 to 1 with white at the top and black at the bottom', () => {
    expect(relativeLuminance(0x000000)).toBe(0);
    expect(relativeLuminance(0xffffff)).toBeCloseTo(1, 10);
    // Green is the channel the standard weights most, blue least: the same
    // \"mid\" value in each must not come out the same luminance.
    expect(relativeLuminance(0x00ff00)).toBeGreaterThan(relativeLuminance(0xff0000));
    expect(relativeLuminance(0xff0000)).toBeGreaterThan(relativeLuminance(0x0000ff));
  });

  it('grades a ratio by the published thresholds, and the thresholds name the grades', () => {
    expect(contrastGrade(CONTRAST_AAA)).toBe('AAA');
    expect(contrastGrade(CONTRAST_AA)).toBe('AA');
    expect(contrastGrade(CONTRAST_AA_LARGE)).toBe('AA-LARGE');
    expect(contrastGrade(2.999)).toBe('LOW');
    expect(contrastGrade(1)).toBe('LOW');
    expect(isBodyTextLegible(CONTRAST_AA)).toBe(true);
    expect(isBodyTextLegible(4.49)).toBe(false);
  });

  it('reads a pair out as the number and the bar, with words for each grade', () => {
    const white = contrastReading(0xffffff, 0x000000);
    expect(white.grade).toBe('AAA');
    expect(white.label).toBe('21.0:1  AAA');
    expect(white.blurb).toBe(CONTRAST_GRADE_BLURB.AAA);
    expect(formatContrast(4.54)).toBe('4.5:1');
  });

  it('is monotone: a bigger gap is never a smaller ratio', () => {
    // Walk one channel away from black and the ratio must not dip.
    let previous = 0;
    for (let v = 0; v <= 255; v += 5) {
      const ratio = contrastRatio((v << 16) | (v << 8) | v, 0x000000);
      expect(ratio).toBeGreaterThanOrEqual(previous);
      previous = ratio;
    }
  });
});

describe('the shipped themes', () => {
  it('keeps every palette legible: body text at AA, dim and accent text at AA-large', () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      const c = theme.colors;
      const body = contrastRatio(c.textPrimary, c.panelFill);
      // Dim text is the app's own second rank — labels, hints, disabled rows —
      // and it may be smaller than the large-text bar allows for, so it is held
      // to AA-large as a floor rather than to AA.
      const dim = contrastRatio(c.textDim, c.panelFill);
      // The accent draws live values and headings, so it has to be readable too.
      const accent = contrastRatio(c.textGreen, c.panelFill);
      if (!isBodyTextLegible(body)) failures.push(`${theme.id}: primary ${formatContrast(body)}`);
      if (dim < CONTRAST_AA_LARGE) failures.push(`${theme.id}: dim ${formatContrast(dim)}`);
      if (accent < CONTRAST_AA_LARGE) failures.push(`${theme.id}: accent ${formatContrast(accent)}`);
    }
    expect(failures).toEqual([]);
  });

  it('has a grade to show for every theme, and the worst one is still named', () => {
    for (const theme of THEMES) {
      const reading = contrastReading(theme.colors.textPrimary, theme.colors.panelFill);
      expect(['AAA', 'AA', 'AA-LARGE', 'LOW']).toContain(reading.grade);
      expect(reading.label).toContain(':1');
    }
    // The list is not empty, so the guard above is checking something.
    expect(THEMES.length).toBeGreaterThanOrEqual(4);
  });
});
