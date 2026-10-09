import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  applyScript,
  createSong,
  DRUMS,
  GENRES,
  instrumentCatalog,
  isDrumName,
  KITS,
  SCRIPT_KEYWORDS,
  SCRIPT_QUICK_REFERENCE,
  SCRIPT_VERSION,
  scriptCapabilities,
  SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  STACK_SONG_FILE_VERSION,
} from '../model';

/**
 * The documentation, tested.
 *
 * Tracklet's whole reason for having a text notation is that something other
 * than a person writes it — and the docs are how that something learns. A doc
 * example that has quietly stopped parsing is worse than no example at all, so
 * every fenced block marked ```script is extracted from `doc/` and applied to a
 * fresh song here. Add an example to the docs and it is checked; break the
 * language and this file says which line of which file broke.
 *
 * Blocks are only collected when the info string is exactly `script`, so prose,
 * tables, shell commands and deliberately-wrong illustrations (```text) are all
 * ignored.
 */

/**
 * Where the documentation actually is.
 *
 * Two layouts exist in the wild: this package's own `doc/` folder, and a
 * workspace that keeps every widget's docs one level up beside it. Resolving it
 * rather than hard-coding it means these tests always run against the docs that
 * SHIP with the app — which is the only version of this file that is worth
 * anything, because a doc test pointed at a folder that does not exist silently
 * stops checking anything at all.
 */
function docDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, '../../../doc'), join(here, '../../doc')];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error(`the doc folder was not found. Looked in: ${candidates.join(', ')}.`);
}

const DOC_DIR = docDir();

/**
 * The agent skill page, at the package root rather than in `doc/`.
 *
 * It is the shortest thing an agent is given and the one most likely to be read
 * on its own, so it is the LEAST safe place for a claim to go stale — which is
 * why it is read here and put through the same guards as the folder below.
 */
function skillPage(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, '..', '..', 'SKILL.md'), join(here, '..', '..', '..', 'SKILL.md')];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error(`the skill page was not found. Looked in: ${candidates.join(', ')}.`);
}

const SKILL = skillPage();

/** The parser's own source: every diagnostic the app can print is a `fail(...)` in it. */
function parserSource(): string {
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'model', 'script.ts'), 'utf8');
}

/**
 * The text between the bracket at `at` and the one that matches it, exclusive.
 *
 * Strings, template literals and comments are stepped over rather than counted,
 * because a message is full of brackets that do not nest — `"pan -40"`, a
 * `${...}`, a `// comment` explaining the fix.
 */
function balanced(source: string, at: number, open: string, close: string): string {
  let depth = 0;
  for (let i = at; i < source.length; i++) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      i = end < 0 ? source.length : end;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i);
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(source, i);
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return source.slice(at + 1, i);
    }
  }
  return source.slice(at + 1);
}

/** The index of the quote that closes the string starting at `at`. */
function skipString(source: string, at: number): number {
  const quote = source[at];
  for (let i = at + 1; i < source.length; i++) {
    if (source[i] === '\\') {
      i++;
      continue;
    }
    if (source[i] === quote) return i;
  }
  return source.length;
}

/** A call's arguments, split on the commas that are not inside brackets or strings. */
function topLevelArgs(source: string): string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      i = end < 0 ? source.length : end;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const end = skipString(source, i);
      current += source.slice(i, end + 1);
      i = end;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      args.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  args.push(current);
  return args;
}

/** A `\u2019`, a `\n` or a `\"` as the message really prints it. */
function unescape(raw: string): string {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_all, escape: string) => {
    if (escape.startsWith('u')) return String.fromCharCode(parseInt(escape.slice(1), 16));
    if (escape === 'n') return '\n';
    if (escape === 't') return '\t';
    return escape;
  });
}

/**
 * The literal runs of every string and template literal in `text`.
 *
 * A template literal becomes one entry per message it can print — a run of
 * chunks, with each `${...}` removed — because a message built by interpolation
 * is still a message, and the parts an author reads are the text around the
 * values. A conditional between two template literals therefore yields two
 * shapes, which is right: both are printed, and both have to be documented.
 */
function literalsIn(text: string): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const end = skipString(text, i);
      out.push([unescape(text.slice(i + 1, end))]);
      i = end;
      continue;
    }
    if (ch === '`') {
      const { chunks, end } = templateChunks(text, i);
      out.push(chunks);
      i = end;
      continue;
    }
  }
  return out;
}

/** A template literal's literal runs, with `${...}` holes cut out. */
function templateChunks(text: string, at: number): { chunks: string[]; end: number } {
  const chunks: string[] = [];
  let current = '';
  for (let i = at + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      current += ch + (text[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '`') {
      chunks.push(unescape(current));
      return { chunks, end: i };
    }
    if (ch === '$' && text[i + 1] === '{') {
      const inner = balanced(text, i + 1, '{', '}');
      chunks.push(unescape(current));
      current = '';
      i += inner.length + 2;
      continue;
    }
    current += ch;
  }
  chunks.push(unescape(current));
  return { chunks, end: text.length };
}

/**
 * One normal form for both sides of the comparison.
 *
 * The docs are prose and the parser is code, so the same sentence arrives with
 * a curly apostrophe, an em dash or a wrapped line on one side and a straight
 * one on the other. Those are not differences an author can see, so they are
 * flattened before anything is compared.
 */
function plainText(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every markdown page in the folder, in name order. */
function docFiles(): string[] {
  return readdirSync(DOC_DIR).filter((name) => name.endsWith('.md')).sort();
}

/**
 * Everything a set of pages writes AS code: every inline `span`, and the body of
 * every fenced block.
 *
 * This is where a word is WRITTEN DOWN, as opposed to merely mentioned, and the
 * distinction is the whole point of the two guards below. `rock` turns up in "a
 * rock bass" whether or not this app ships a `rock` kit, so prose is the wrong
 * haystack for "has this vocabulary been documented?" — but `` `kit rock` `` is
 * not, and neither is a table cell holding `bright`. A word that only ever
 * appeared inside a sentence therefore fails, which is the behaviour a coverage
 * guard has to have: a check that a stray mention can satisfy is a check that
 * will pass while the page says nothing.
 */
function codeTextOf(text: string): string {
  const parts: string[] = [];
  for (const span of text.matchAll(/`[^`\n]+`/g)) parts.push(span[0]);
  for (const fence of text.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)) parts.push(fence[1]);
  return parts.join('\n');
}

/** The same, for pages that live in `doc/` and are named rather than handed in. */
function codeTextIn(files: readonly string[]): string {
  return files.map((name) => codeTextOf(readFileSync(join(DOC_DIR, name), 'utf8'))).join('\n');
}

/** Which pages the agent briefs are, so both guards read the same pair. */
const BRIEF_FILES = ['07-agent-guide.md', '08-agent-prompt.md'] as const;

interface DiagnosticShape {
  /** The line in `script.ts` that prints it. */
  line: number;
  /** The message's literal runs, interpolation removed. */
  chunks: string[];
}

/**
 * Every message the parser can print, read out of the parser.
 *
 * A diagnostic is `fail(line, message)`, so the shapes are the message
 * expressions themselves — including both arms of a conditional, and the body
 * of a helper a message is built by (`settingWordHint`, which is a message per
 * word it refuses). Nothing here is a list of messages that someone has to
 * remember to update: the day a new `fail` lands, this sees it.
 */
function diagnosticShapes(): DiagnosticShape[] {
  const source = parserSource();
  // Functions declared in the file, so `fail(line, helper(...))` is followed.
  const helpers = new Map<string, string>();
  for (const match of source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const open = source.indexOf('(', match.index);
    const params = balanced(source, open, '(', ')');
    const brace = source.indexOf('{', open + params.length + 2);
    helpers.set(match[1], balanced(source, brace, '{', '}'));
  }

  const shapes: DiagnosticShape[] = [];
  for (const match of source.matchAll(/\bfail\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    const args = topLevelArgs(balanced(source, open, '(', ')'));
    const message = args[1] ?? '';
    let texts = literalsIn(message);
    for (const [name, body] of helpers) {
      if (new RegExp(`\\b${name}\\s*\\(`).test(message)) texts = texts.concat(literalsIn(body));
    }
    const line = source.slice(0, match.index).split('\n').length;
    for (const chunks of texts) {
      const parts = chunks.map(plainText).filter((part) => part !== '');
      if (parts.length === 0) continue;
      shapes.push({ line, chunks: parts });
    }
  }
  return shapes;
}

const shapes = diagnosticShapes();

/**
 * Every message one named function in the parser can hand back.
 *
 * Advisories are built by `advisoriesFor` rather than by a `fail(...)` call,
 * because an advisory is not a mistake: it is the app noticing something an
 * author usually wants to know, printed beside the summary after a script has
 * already applied. They are the same kind of promise as a diagnostic, though — a
 * sentence the app says to a person — so they get the same guard.
 */
function messageShapesIn(name: string): string[][] {
  const source = parserSource();
  const at = source.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (at < 0) throw new Error(`${name} is no longer in script.ts, so this guard is checking nothing.`);
  const open = source.indexOf('(', at);
  const params = balanced(source, open, '(', ')');
  const brace = source.indexOf('{', open + params.length + 2);
  return literalsIn(balanced(source, brace, '{', '}'))
    .map((chunks) => chunks.map(plainText).filter((part) => part !== ''))
    .filter((chunks) => chunks.length > 0);
}

/** A markdown code fence, without writing backticks inside a template literal. */
const FENCE = '`'.repeat(3);

interface Block {
  file: string;
  /** 1-based line number of the opening fence, for the failure message. */
  line: number;
  source: string;
}

/** Every ```script block in one page, with the line its fence opened on. */
function scriptBlocksIn(file: string, text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split(/\r?\n/);
  let start = -1;
  lines.forEach((line, index) => {
    const fence = /^```(\S*)\s*$/.exec(line);
    if (!fence) return;
    if (start < 0) {
      if (fence[1] === 'script') start = index;
      return;
    }
    blocks.push({ file, line: start + 1, source: lines.slice(start + 1, index).join('\n') });
    start = -1;
  });
  if (start >= 0) throw new Error(`${file}: an unclosed ${FENCE}script fence at line ${start + 1}`);
  return blocks;
}

/**
 * Every page an agent is pointed at: the whole `doc/` folder, and the skill page
 * at the package root.
 *
 * They are one promise told at two lengths, so they are checked together rather
 * than the long one being tested and the short one merely meant to be right.
 */
function agentPages(): { name: string; text: string }[] {
  const pages = docFiles().map((name) => ({ name, text: readFileSync(join(DOC_DIR, name), 'utf8') }));
  return [...pages, { name: 'SKILL.md', text: SKILL }];
}

/** Every ```script block on every page an agent reads. */
function scriptBlocks(): Block[] {
  return agentPages().flatMap((page) => scriptBlocksIn(page.name, page.text));
}

const blocks = scriptBlocks();

describe('the doc folder', () => {
  it('exists and has examples in it', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(15);
  });

  it('applies every ```script block to a fresh song without an error', () => {
    const failures: string[] = [];
    for (const block of blocks) {
      const result = applyScript(createSong(), block.source);
      if (!result.ok) {
        for (const error of result.errors) {
          failures.push(`${block.file}:${block.line} (block line ${error.line}): ${error.message}`);
        }
      }
    }
    expect(failures.join('\n')).toBe('');
  });

  it('makes each example a song with actual notes in it', () => {
    const silent: string[] = [];
    for (const block of blocks) {
      const result = applyScript(createSong(), block.source);
      if (result.ok && result.summary.notes === 0) {
        silent.push(`${block.file}:${block.line}`);
      }
    }
    expect(silent.join('\n')).toBe('');
  });

  it('keeps every example inside the limits the reference documents', () => {
    const outOfRange: string[] = [];
    for (const block of blocks) {
      const result = applyScript(createSong(), block.source);
      if (!result.ok) continue;
      const { summary } = result;
      if (summary.steps < 1 || summary.steps > 512) outOfRange.push(`${block.file}:${block.line} steps ${summary.steps}`);
      if (summary.stepsPerBeat < 1 || summary.stepsPerBeat > 16) outOfRange.push(`${block.file}:${block.line} beat ${summary.stepsPerBeat}`);
      if (summary.tracks > 8) outOfRange.push(`${block.file}:${block.line} tracks ${summary.tracks}`);
      if (summary.bpm < 40 || summary.bpm > 300) outOfRange.push(`${block.file}:${block.line} bpm ${summary.bpm}`);
    }
    expect(outOfRange.join('\n')).toBe('');
  });

  it('does not use a command word the parser does not know', () => {
    // A cheap spelling check: prose may mention any word it likes, but a
    // ```script block must only ever start a line with a real command or a note.
    // This is also what catches a doc example written against an older language.
    const known = new Set<string>(SCRIPT_KEYWORDS);
    const suspicious: string[] = [];
    for (const block of blocks) {
      for (const raw of block.source.split('\n')) {
        const line = raw.replace(/(#|\/\/).*$/, '').trim();
        if (line === '') continue;
        const head = line.split(/\s+/)[0].toLowerCase();
        if (known.has(head)) continue;
        // A grid word may also NAME a drum (`kick . hat*3 .`), which is a cell like
        // any other: the kit is a closed list the parser reads, so ask it rather
        // than spelling the four words a second time here. The suffix is cut the
        // same way §2 spells it — the gesture and the force come off the word.
        if (isDrumName(head.replace(/[>*~!].*$/, ''))) continue;
        // A cell, in every shape §2 documents: one pitch or a comma run of them,
        // then the articulation (`>`, `*N` and/or `!`/`!!`) and the `~velocity`
        // in either order.
        const pitch = '[a-g](#|b)?-?\\d*';
        const gesture = '((~\\d+)?(?:[>*]\\d*|!{1,2})+)';
        if (new RegExp(`^(${pitch})(,${pitch})*${gesture}?(~\\d+)?$`).test(head)) continue;
        if (/^[.\-_]+$/.test(head)) continue;
        suspicious.push(`${block.file}:${block.line}: "${head}"`);
      }
    }
    expect(suspicious.join('\n')).toBe('');
  });
});

describe('the error catalogue', () => {
  const catalogue = plainText(readFileSync(join(DOC_DIR, '05-error-catalogue.md'), 'utf8'));

  it('finds the diagnostics to check', () => {
    // A guard on the guard: if the extraction above ever stops finding `fail(`
    // calls — a rename, a refactor — the coverage test below would pass by
    // finding nothing to complain about. Forty is far below today's count and
    // far above zero.
    expect(shapes.length).toBeGreaterThanOrEqual(40);
  });

  it('documents every message the parser can print', () => {
    // The message is matched as its literal runs in order, so the values a
    // message interpolates may be spelled out in the doc (`new, song, key`) or
    // stand in as `<…>` — what must not drift is the sentence around them.
    const undocumented: string[] = [];
    for (const shape of shapes) {
      const pattern = new RegExp(shape.chunks.map(escapeRegExp).join('[\\s\\S]*?'));
      if (!pattern.test(catalogue)) {
        undocumented.push(`script.ts:${shape.line}: ${shape.chunks.join(' <…> ')}`);
      }
    }
    expect(undocumented.join('\n')).toBe('');
  });
});

describe('the advisories', () => {
  const catalogue = plainText(readFileSync(join(DOC_DIR, '05-error-catalogue.md'), 'utf8'));

  it('documents every observation the summary can make', () => {
    const undocumented = messageShapesIn('advisoriesFor')
      .filter((chunks) => !new RegExp(chunks.map(escapeRegExp).join('[\\s\\S]*?')).test(catalogue))
      .map((chunks) => chunks.join(' <…> '));
    expect(undocumented.join('\n')).toBe('');
  });
});

describe('the language coverage', () => {
  it('names every command word in the reference, so no command lives only in code', () => {
    const reference = readFileSync(join(DOC_DIR, '03-script-reference.md'), 'utf8');
    const missing = SCRIPT_KEYWORDS.filter((word) => !new RegExp(`\\b${word}\\b`, 'i').test(reference));
    expect(missing).toEqual([]);
  });

  it('names every command word in the cheat sheet beside the paste box', () => {
    // The other half of the same rule, and the half a person sees first: a word
    // the panel never shows may as well not exist. (The panel's own suite checks
    // its length and its width; this checks its completeness.)
    const shown = plainText(SCRIPT_QUICK_REFERENCE.join(' / '));
    const missing = SCRIPT_KEYWORDS.filter((word) => !new RegExp(`\\b${word}\\b`, 'i').test(shown));
    expect(missing).toEqual([]);
  });
});

describe('the doc index', () => {
  it('links every file in the folder, so nothing is undiscoverable', () => {
    const files = readdirSync(DOC_DIR).filter((name) => name.endsWith('.md'));
    const readme = readFileSync(join(DOC_DIR, 'README.md'), 'utf8');
    const unlinked = files.filter((name) => name !== 'README.md' && !readme.includes(name));
    expect(unlinked).toEqual([]);
  });
});

describe('the catalog coverage', () => {
  /**
   * Every word the catalog publishes that a reader TYPES or CLICKS, with the
   * sentence that says when to reach for it.
   *
   * A FAMILY is deliberately not here. `lead`, `bass`, `harmony` and
   * `percussion` are the HEADINGS the sound menu groups its voices under rather
   * than words any script writes or any menu picks, so the docs describe them in
   * prose — HARMONY, "chords, pads and sustained background" — and demanding a
   * spelling would be demanding a word nobody types. `catalog.test.ts` checks
   * those four, with the waveforms and the voices, against their own tables.
   * Everything below is a value a script spells: `wave sawtooth`, `chip nes`,
   * `kit 808`, `track 2 drive 40`, `layer 1 2 detune -11`.
   */
  function spellableWords(): { kind: string; word: string; blurb: string }[] {
    const catalog = instrumentCatalog();
    return [
      ...catalog.waves.map((entry) => ({ kind: 'wave', word: entry.id, blurb: entry.blurb })),
      ...catalog.knobs.map((entry) => ({ kind: 'knob', word: entry.id, blurb: entry.blurb })),
      ...catalog.voices.map((entry) => ({ kind: 'voice', word: entry.id, blurb: entry.blurb })),
      ...catalog.chips.map((entry) => ({ kind: 'console', word: entry.id, blurb: entry.blurb })),
      ...catalog.effects.map((entry) => ({ kind: 'effect', word: entry.id, blurb: entry.blurb })),
      { kind: 'control', word: catalog.duck.id, blurb: catalog.duck.blurb },
      ...catalog.shapes.map((entry) => ({ kind: 'filter shape', word: entry.id, blurb: entry.blurb })),
      ...catalog.kits.map((entry) => ({ kind: 'kit', word: entry.id, blurb: entry.blurb })),
      ...catalog.layers.fields.map((entry) => ({
        kind: 'layer field', word: entry.id, blurb: entry.blurb,
      })),
    ];
  }

  const words = spellableWords();

  it('publishes every one of those words with a sentence saying what it is for', () => {
    // A guard on the guard: if the lists above ever stop finding the tables — a
    // rename, a refactor — the test below would pass by having nothing left to
    // complain about. The catalog holds sixty-odd words today; forty is far below
    // that and far above zero.
    expect(words.length).toBeGreaterThanOrEqual(40);
    const thin = words
      .filter((entry) => entry.blurb.trim().length < 20 || entry.blurb.trim() === entry.word)
      .map((entry) => `${entry.kind} "${entry.word}": ${JSON.stringify(entry.blurb)}`);
    expect(thin.join('\n')).toBe('');
  });

  it('spells every one of those words somewhere in the docs', () => {
    // The vocabulary is spread over pages on purpose — the closed lists in `03`,
    // the channel advice in `07`, the consoles in `03` again — so the question is
    // not "which page" but "is this word written down at all, as a word". A
    // catalog entry nothing spells is vocabulary a reader cannot discover, which
    // is what this catches the day a waveform or a kit is added to the tables.
    const code = codeTextIn(docFiles());
    const missing = words
      .filter((entry) => !new RegExp(`\\b${escapeRegExp(entry.word)}\\b`, 'i').test(code))
      .map((entry) => `${entry.kind} "${entry.word}"`);
    expect(missing.join('\n')).toBe('');
  });

  it('spells them in the skill page too, which is what an agent reads first', () => {
    // The skill page is meant to be enough on its own, and "enough" includes
    // knowing that `granular` and `hollow` are words you are allowed to write.
    const code = codeTextOf(SKILL);
    const missing = words
      .filter((entry) => !new RegExp(`\\b${escapeRegExp(entry.word)}\\b`, 'i').test(code))
      .map((entry) => `${entry.kind} "${entry.word}"`);
    expect(missing.join('\n')).toBe('');
  });
});

describe('the agent briefs', () => {
  const briefs = new Map(
    BRIEF_FILES.map((name) => [name, readFileSync(join(DOC_DIR, name), 'utf8')] as const),
  );
  const guide = briefs.get('07-agent-guide.md')!;

  /**
   * The rows of the first markdown table after `intro`, as text.
   *
   * Stopping at the END of that one table matters: the guide has a dozen tables,
   * and the knob list is full of first cells that look exactly like the manifest
   * fields this is after — a row whose first cell is one backticked word. Reading
   * on into the next table would report the nine knobs as missing manifest keys.
   */
  function rowsAfter(text: string, intro: string): string[] {
    const at = text.indexOf(intro);
    if (at < 0) return [];
    const rows: string[] = [];
    let started = false;
    for (const line of text.slice(at + intro.length).split(/\r?\n/)) {
      if (line.startsWith('|')) {
        started = true;
        rows.push(line);
        continue;
      }
      // The table is over at the first line that is not a row — and if prose
      // arrived first, there was no table here at all.
      if (started || line.trim() !== '') break;
    }
    return rows;
  }

  it('promises only the manifest fields this build publishes', () => {
    // The guide answers "what can I ask the running app?" with a table of field
    // names, and that table is a claim about `scriptCapabilities()`. A field the
    // manifest renames has to be renamed here too, or an agent reads a key that
    // does not exist and concludes the build is broken.
    const promised = rowsAfter(guide, 'the whole language as data:')
      .map((row) => /^\|\s*`([A-Za-z]\w*)`\s*\|/.exec(row)?.[1])
      .filter((field): field is string => field !== undefined);
    const published = Object.keys(scriptCapabilities());
    expect(promised.length).toBeGreaterThanOrEqual(6);
    expect(promised.filter((field) => !published.includes(field)).join('\n')).toBe('');
  });

  it('walks the version history as far as this build actually goes', () => {
    // The `scriptVersion` row is the guide's entire answer to "which words does
    // this build know", told as a walk through the versions. The newest one it
    // names has to BE the newest: a row ending at 20 describes a language one
    // version out of date, which is the drift this whole block exists to catch.
    const row = /^\|\s*`scriptVersion`.*$/m.exec(guide)?.[0] ?? '';
    const named = [...row.matchAll(/`(\d+)`/g)].map((match) => Number(match[1]));
    expect(named.length).toBeGreaterThan(3);
    expect(Math.max(...named)).toBe(SCRIPT_VERSION);
  });

  it('quotes the file versions this build really writes and reads', () => {
    // The same rule for the BYTES rather than the words: a tool that reads "the
    // newest version this build can read (28)" and is then handed a 29 refuses a
    // file it could have opened. This is the check that failed the day it was
    // written, which is the best argument for its existence.
    const row = /^\|\s*`fileVersions`.*$/m.exec(guide)?.[0] ?? '';
    const named = [...row.matchAll(/\((\d+)/g)].map((match) => Number(match[1]));
    expect(named).toEqual(
      expect.arrayContaining([SONG_FILE_VERSION, STACK_SONG_FILE_VERSION, SONG_FILE_VERSION_MAX]),
    );
  });

  it('names every kit, drum and starter it tells an agent to write', () => {
    // The guide lists the closed lists an agent may draw from, so a fifth kit or
    // a new starter has to reach the prose an agent actually reads — the same
    // promise the manifest documents, made in the place a model is told to look.
    const code = codeTextIn(BRIEF_FILES);
    const missing = [
      ...KITS.map((kit) => ({ kind: 'kit', word: kit.id })),
      ...DRUMS.map((drum) => ({ kind: 'drum', word: drum.id })),
      ...GENRES.map((genre) => ({ kind: 'starter', word: genre.id })),
    ]
      .filter((entry) => !new RegExp(`\\b${escapeRegExp(entry.word)}\\b`, 'i').test(code))
      .map((entry) => `${entry.kind} "${entry.word}"`);
    expect(missing.join('\n')).toBe('');
  });

  it('points an agent at pages that exist', () => {
    // The briefs are a HANDOFF, and they name the pages to read. A renamed page
    // turns the first instruction an agent is given into a dead end, and the
    // round trip that follows is spent discovering that.
    const wanted = new Set<string>();
    for (const text of briefs.values()) {
      // A markdown link to a page in this folder: [label](03-script-reference.md).
      for (const link of text.matchAll(/\]\(([^)#\s]+\.md)\)/g)) wanted.add(link[1]);
      // A path written out in a code span: `doc/03-script-reference.md`. The
      // leading character class keeps the neighbour app's `noislet/doc/...` out:
      // that path belongs to another project, not to this folder.
      for (const path of text.matchAll(/(^|[\s`(])doc\/([A-Za-z0-9._-]+\.md)/gm)) wanted.add(path[2]);
    }
    expect(wanted.size).toBeGreaterThanOrEqual(4);
    const missing = [...wanted].filter((name) => !existsSync(join(DOC_DIR, name)));
    expect(missing.join('\n')).toBe('');
  });
});

describe('the skill page', () => {
  it('loads as a skill: a name, and a description that says when to use it', () => {
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(SKILL)?.[1] ?? '';
    // A loader matches an ask against the description, so both halves of the
    // frontmatter are load-bearing rather than decoration: the name is what it is
    // called, and "use when" is the only thing that decides whether it is opened.
    expect(/^name:\s*\S+/m.test(front)).toBe(true);
    expect(/^description:\s*\S+/m.test(front)).toBe(true);
    expect(front).toMatch(/[Uu]se when/);
  });

  it('names every command word, so it is a complete language on one page', () => {
    // The skill page is the shortest thing an agent is handed, so a word missing
    // from it is a word an agent will not know exists unless it reads further.
    const missing = SCRIPT_KEYWORDS.filter((word) => !new RegExp(`\\b${word}\\b`).test(SKILL));
    expect(missing.join(' ')).toBe('');
  });

  it('points an agent at pages that exist', () => {
    const wanted = new Set<string>();
    for (const link of SKILL.matchAll(/\]\((doc\/[^)#\s]+\.md)\)/g)) wanted.add(link[1].replace(/^doc\//, ''));
    for (const path of SKILL.matchAll(/(^|[\s`(])doc\/([A-Za-z0-9._-]+\.md)/gm)) wanted.add(path[2]);
    expect(wanted.size).toBeGreaterThanOrEqual(4);
    const missing = [...wanted].filter((name) => !existsSync(join(DOC_DIR, name)));
    expect(missing.join('\n')).toBe('');
  });
});
