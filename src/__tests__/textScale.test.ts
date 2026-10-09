import { beforeEach, describe, expect, it } from 'vitest';

import { pickStoredTextScale, rememberTextScale, TEXT_SCALE_STORAGE_KEY } from '../textScalePrefs';
import type { KeyValueStore } from '../themePrefs';
import {
  activeTextScale,
  activeTextScaleFactor,
  DEFAULT_TEXT_SCALE,
  isTextScale,
  nextTextScale,
  setTextScale,
  TEXT_SCALES,
  textScaleAbout,
  textScaleFactor,
  textScaleLabel,
  type TextScale,
} from '../ui/textScale';

/**
 * textScale — the closed list of sizes, the identity at `normal`, the cycle, and
 * the preference that survives a reload without ever trusting what it reads.
 */

/**
 * A store as small as the app needs, with the two failure modes a real one has:
 * a read that throws (a blocked or private store) and a write that throws (a full
 * quota). Both are options rather than separate fakes, because the module's whole
 * contract is that neither is fatal.
 */
function fakeStore(initial: Record<string, string> = {}, opts: { readThrows?: boolean; writeThrows?: boolean } = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem(key: string): string | null {
      if (opts.readThrows) throw new Error('blocked');
      return data[key] ?? null;
    },
    setItem(key: string, value: string): void {
      if (opts.writeThrows) throw new Error('quota');
      data[key] = value;
    },
  };
}

describe('the text sizes', () => {
  beforeEach(() => setTextScale(DEFAULT_TEXT_SCALE));

  it('is a closed list, smallest first, with `normal` as the identity', () => {
    expect([...TEXT_SCALES]).toEqual(['normal', 'large', 'huge']);
    expect(DEFAULT_TEXT_SCALE).toBe('normal');
    expect(textScaleFactor('normal')).toBe(1);
  });

  it('accepts the three words and nothing else', () => {
    for (const word of TEXT_SCALES) expect(isTextScale(word)).toBe(true);
    // The label is the word uppercased, and the storage keeps the lower-case id —
    // storing 'LARGE' would be storing something that cannot be read back.
    expect(isTextScale('LARGE')).toBe(false);
    expect(isTextScale('normal ')).toBe(false);
    expect(isTextScale('small')).toBe(false);
    expect(isTextScale('')).toBe(false);
  });

  it('makes each size strictly bigger than the last', () => {
    const factors = TEXT_SCALES.map((word) => textScaleFactor(word));
    for (let i = 1; i < factors.length; i += 1) {
      expect(factors[i]!).toBeGreaterThan(factors[i - 1]!);
    }
  });

  it('cycles through the list and wraps round to the smallest', () => {
    expect(TEXT_SCALES.map((word) => nextTextScale(word))).toEqual(['large', 'huge', 'normal']);
    // Three steps from anywhere is where you started.
    for (const word of TEXT_SCALES) {
      let at: TextScale = word;
      for (let i = 0; i < TEXT_SCALES.length; i += 1) at = nextTextScale(at);
      expect(at).toBe(word);
    }
  });

  it('labels every size and explains every size', () => {
    for (const word of TEXT_SCALES) {
      expect(textScaleLabel(word)).toBe(word.toUpperCase());
      const about = textScaleAbout(word);
      expect(about.length).toBeGreaterThan(0);
      // Every line tells you which text it is about, because the canvas is a
      // different thing that has its own answer.
      expect(about).toContain('TEXT BOXES');
    }
  });

  it('holds one live value, and refuses a word that is not a size', () => {
    expect(activeTextScale()).toBe('normal');
    expect(activeTextScaleFactor()).toBe(1);
    setTextScale('large');
    expect(activeTextScale()).toBe('large');
    expect(activeTextScaleFactor()).toBe(textScaleFactor('large'));
    // A bad value is ignored rather than stored as-is: the factor has to stay a
    // real one, or every text box in the app gets `NaN`px.
    setTextScale('enormous' as TextScale);
    expect(activeTextScale()).toBe('large');
    setTextScale(DEFAULT_TEXT_SCALE);
  });
});

describe('the remembered text size', () => {
  it('is the default when nothing is stored', () => {
    expect(pickStoredTextScale(fakeStore())).toBe('normal');
  });

  it('reads back a word that is still a size, and ignores one that is not', () => {
    expect(pickStoredTextScale(fakeStore({ [TEXT_SCALE_STORAGE_KEY]: 'huge' }))).toBe('huge');
    // An older build, a hand-edited key, a word from a list that changed.
    expect(pickStoredTextScale(fakeStore({ [TEXT_SCALE_STORAGE_KEY]: 'gigantic' }))).toBe('normal');
    expect(pickStoredTextScale(fakeStore({ [TEXT_SCALE_STORAGE_KEY]: '' }))).toBe('normal');
  });

  it('round-trips what it wrote, under its own namespaced key', () => {
    const store = fakeStore();
    expect(rememberTextScale('large', store)).toBe(true);
    expect(store.data[TEXT_SCALE_STORAGE_KEY]).toBe('large');
    expect(pickStoredTextScale(store)).toBe('large');
  });

  it('refuses to write a word that could not be read back', () => {
    const store = fakeStore();
    expect(rememberTextScale('enormous' as TextScale, store)).toBe(false);
    expect(store.data[TEXT_SCALE_STORAGE_KEY]).toBeUndefined();
  });

  it('survives a store that throws, in both directions, and a missing one', () => {
    expect(pickStoredTextScale(fakeStore({}, { readThrows: true }))).toBe('normal');
    expect(rememberTextScale('huge', fakeStore({}, { writeThrows: true }))).toBe(false);
    expect(pickStoredTextScale(null)).toBe('normal');
    expect(rememberTextScale('huge', null)).toBe(false);
  });
});
