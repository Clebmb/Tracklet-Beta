/**
 * Every glyph the UI can print has to come from somewhere.
 *
 * The whole interface is set in the bundled pixel face (`Silkscreen`) with
 * `monospace` behind it, and a canvas text object does not warn when it cannot
 * find a character — it quietly borrows one from whatever font the system hands
 * it, or shows a `tofu` box. Neither shows up in a diff, so a page that spells
 * `HEAR RUN` with a triangle nobody ever checked looks fine on the machine it
 * was written on and like a row of boxes somewhere else.
 *
 * This file settles the question by reading the face's own character map rather
 * than trusting a rendering, and then holds the UI to it: a glyph is either in
 * the pixel face (the measured, styled answer) or it is listed below with a
 * reason (a glyph the mockups themselves draw, which no pixel face of this size
 * can supply). Adding a new shape to a label therefore costs one line of
 * justification here, which is the point.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');

/** Where the UI's words live. Every user-visible string in the app is in here. */
const COPY_DIRS = ['src/ui', 'src/scenes'];

/**
 * The bundled pixel face. `Silkscreen` is a pixel font: it carries Latin, Latin
 * Extended-A, combining marks and the handful of General Punctuation the source
 * text needed (`· – ’ « » • …`). It carries no geometric shapes at all — no
 * square, no triangle, no arrow — so anything shaped comes from a fallback.
 */
const FACE = join(ROOT, 'public/fonts/silkscreen.ttf');

/**
 * The shaped glyphs the UI prints anyway, because the mockups draw them and a
 * character in a text object is the only way to draw one.
 *
 * Every entry here is measured, not guessed. The face behind `Silkscreen` in
 * the app's stack is `monospace`, which on a desktop is Consolas, and Consolas
 * carries `▸ ▾ − → ■ ●` out of this list — it does not carry `▶ ◀ ⟲`, so those
 * three reach past the declared stack into whatever symbol font the system
 * offers (`Segoe UI Symbol` on Windows and macOS's own set have all nine).
 * Borrrowing is therefore safe on every desktop the app targets, and it is how
 * the arranger, the drum machine, the recorder and the arp page have always
 * drawn their play, stop, caret and loop marks. What is not safe is adding the
 * tenth without saying why: a glyph nobody checked is a row of boxes on the one
 * machine that lacks it, and nothing else in the build would notice.
 */
const BORROWED_GLYPHS = new Map<number, string>([
  [0x25b6, '▶ play triangle — the first half of every transport button'],
  [0x25a0, '■ stop square — the running half of those same buttons'],
  [0x25cf, '● record dot — the idle record button and the RECORDING status'],
  [0x25c0, '◀ left triangle — the arranger row it scrolls back from'],
  [0x25b8, '▸ small right triangle — before SECTION in the drum machine'],
  [0x25be, '▾ caret — marks the selector rows that open a list'],
  [0x2212, '− minus sign — the recorder zoom-out button, beside an ASCII plus'],
  [0x2192, '→ arrow — between the two ends of the recorder TRIM and LOOP readouts'],
  [0x27f2, '⟲ loop arrow — in front of LOOP ON and LOOP OFF on the recorder'],
]);

/** Codepoints in a face's `cmap`, in both of the table formats fonts use. */
function readCmap(file: string): Set<number> {
  const d = readFileSync(file);
  const u16 = (at: number) => d.readUInt16BE(at);
  const s16 = (at: number) => d.readInt16BE(at);
  const u32 = (at: number) => d.readUInt32BE(at);

  const tables = new Map<string, number>();
  for (let i = 0; i < u16(4); i++) {
    const at = 12 + i * 16;
    tables.set(d.toString('latin1', at, at + 4), u32(at + 8));
  }
  const cmap = tables.get('cmap');
  if (cmap === undefined) throw new Error(`${file} has no cmap table`);

  const points = new Set<number>();
  const subtables = u16(cmap + 2);
  for (let s = 0; s < subtables; s++) {
    const at = cmap + u32(cmap + 4 + s * 8 + 4);
    const format = u16(at);

    if (format === 4) {
      const count = u16(at + 6) / 2;
      const ends = at + 14;
      const starts = ends + u16(at + 6) + 2;
      const deltas = starts + u16(at + 6);
      const ranges = deltas + u16(at + 6);
      for (let i = 0; i < count; i++) {
        const start = u16(starts + i * 2);
        const end = u16(ends + i * 2);
        const delta = s16(deltas + i * 2);
        const range = u16(ranges + i * 2);
        // `count` is 12 for this face; the guard is for the 8-bit code page.
        for (let c = start; c <= end && c < 0xffff; c++) {
          let glyph: number;
          if (range === 0) {
            glyph = (c + delta) & 0xffff;
          } else {
            const at2 = ranges + i * 2 + range + (c - start) * 2;
            if (at2 + 2 > d.length) continue;
            glyph = u16(at2);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) points.add(c);
        }
      }
    } else if (format === 12) {
      for (let i = 0; i < u32(at + 12); i++) {
        const group = at + 16 + i * 12;
        const start = u32(group);
        const end = u32(group + 4);
        for (let c = start; c <= end; c++) points.add(c);
      }
    }
  }
  return points;
}

/**
 * Every non-ASCII codepoint a module can put on screen.
 *
 * Only string and template literals count. Comments are prose — they are full of
 * `·` and `→` and never render — and a scan that read them would demand a font
 * glyph for an explanation. Escape sequences are decoded so a label spelled
 * `'\u25a0  STOP'` is seen as the square it turns into.
 */
type Mode = 'code' | 'line' | 'block' | '"' | "'" | '`';

function glyphsIn(source: string): number[] {
  const found: number[] = [];
  let mode: Mode = 'code';
  // A template can hold `${...}` holding another template, so the scanner needs
  // to remember which literal it is inside of. Without the stack the closing
  // backtick of an interpolation reads as an opening one, and every comment
  // after it is mistaken for copy.
  const stack: Mode[] = [];
  let braces = 0;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (mode === 'code') {
      if (ch === '/' && next === '/') { mode = 'line'; i += 2; continue; }
      if (ch === '/' && next === '*') { mode = 'block'; i += 2; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { mode = ch; i += 1; continue; }
      if (ch === '{') braces += 1;
      if (ch === '}' && braces === 0 && stack.length > 0) {
        mode = stack.pop() as Mode;
        i += 1;
        continue;
      }
      if (ch === '}' && braces > 0) braces -= 1;
      i += 1; continue;
    }
    if (mode === 'line') { if (ch === '\n') mode = 'code'; i += 1; continue; }
    if (mode === 'block') {
      if (ch === '*' && next === '/') { mode = 'code'; i += 2; continue; }
      i += 1; continue;
    }
    if (ch === '\\') {
      const escape =
        /^\\u([0-9a-fA-F]{4})/.exec(source.slice(i, i + 6)) ??
        /^\\x([0-9a-fA-F]{2})/.exec(source.slice(i, i + 4));
      if (escape) { found.push(parseInt(escape[1], 16)); i += escape[0].length; continue; }
      i += 2; continue;
    }
    if (ch === mode) { mode = 'code'; i += 1; continue; }
    if (mode === '`' && ch === '$' && next === '{') {
      stack.push(mode);
      braces = 0;
      mode = 'code';
      i += 2;
      continue;
    }
    found.push(ch.codePointAt(0) as number);
    i += 1;
  }
  return found;
}

function filesIn(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const path = join(dir, entry);
    if (statSync(join(ROOT, path)).isDirectory()) out.push(...filesIn(path));
    else if (path.endsWith('.ts')) out.push(path);
  }
  return out;
}

const COPY_FILES = COPY_DIRS.flatMap(filesIn);

/** The glyphs the UI prints, with the modules that print them. */
const PRINTED = new Map<number, string[]>();
for (const file of COPY_FILES) {
  for (const point of glyphsIn(readFileSync(join(ROOT, file), 'utf8'))) {
    if (point < 0x80) continue;
    const where = PRINTED.get(point) ?? [];
    if (!where.includes(file)) where.push(file);
    PRINTED.set(point, where);
  }
}

const name = (point: number) =>
  `U+${point.toString(16).toUpperCase().padStart(4, '0')} ${String.fromCodePoint(point)}`;

describe('the glyphs the UI prints', () => {
  it('reads a face that actually carries the alphabet', () => {
    const face = readCmap(FACE);
    expect(face.has(0x41)).toBe(true);
    expect(face.has(0x7e)).toBe(true);
    expect(face.size).toBeGreaterThan(150);
    // The finding this file exists for: a pixel face this size has no shapes,
    // however in-style they would look.
    expect(face.has(0x25a0)).toBe(false);
    expect(face.has(0x25b6)).toBe(false);
    // ...and neither does any other shape, which is why the list above exists.
    expect(face.has(0x25be)).toBe(false);
    expect(face.has(0x2192)).toBe(false);
    expect(face.has(0x2212)).toBe(false);
  });

  it('takes every glyph from the pixel face, or names the excuse', () => {
    const face = readCmap(FACE);
    const borrowed = [...PRINTED]
      .filter(([point]) => !face.has(point) && !BORROWED_GLYPHS.has(point))
      .map(([point, where]) => `${name(point)} used by ${where.join(', ')}`);
    expect(borrowed).toEqual([]);
  });

  it('documents why each borrowed glyph is worth borrowing', () => {
    for (const [point, reason] of BORROWED_GLYPHS) {
      expect(reason.length, name(point)).toBeGreaterThan(20);
      expect(reason).not.toMatch(/^(todo|glyph|none)/i);
    }
  });

  it('keeps no excuse for a glyph it stopped printing', () => {
    const stale = [...BORROWED_GLYPHS].filter(([point]) => !PRINTED.has(point)).map(([point]) => name(point));
    expect(stale).toEqual([]);
  });

  it('finds the copy it is checking', () => {
    expect(COPY_FILES.length).toBeGreaterThan(10);
    expect(PRINTED.size).toBeGreaterThan(3);
  });
});
