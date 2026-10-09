/**
 * sample — the recordings you own, and the way a song names one.
 *
 * ── The problem this solves ─────────────────────────────────────────────────
 * The app could already play a `.wav` OUT (EXPORT AUDIO) but never IN. Every
 * percussion hit was one of six one-shots the engine renders from arithmetic, and
 * a soundfont could bring somebody else's recordings into the app but only as a
 * whole keyboard. A tracker's oldest trick — drop a break in, play it pitched —
 * had nowhere to live.
 *
 * ── Where a sample LIVES, and why ───────────────────────────────────────────
 * This is the `.sf2` precedent, applied to one file: **the bytes live in the APP
 * and the song holds only a name.** A sample is megabytes of somebody's audio,
 * and a song file is a few kilobytes of text that has to stay openable, diffable
 * and hand-editable — so a song says `sample CLOPSH` on a channel line and the
 * app supplies whatever it has under that name.
 *
 * The consequence is the important part: **a song naming a sample you do not
 * have still plays.** The channel falls back to the built-in one-shot its `duty`
 * selects (see `SAMPLE_BANK` in `audio/synth.ts`), which is what the channel
 * would have played if the line had never been written. A missing sample is a
 * missing FLAVOUR, never a missing note — the same guarantee a `wave font`
 * channel makes when no font is open.
 *
 * ── One channel of frames ───────────────────────────────────────────────────
 * A slot is MONO and holds one channel of frames, because a channel is already a
 * place in the stereo picture here (`pan`): a stereo sample would mean a second
 * pan fighting the one the mixer has, which is one control answering to two
 * names. `monoPcm` in `audio/wav.ts` folds the sides together on the way in.
 *
 * ── Where the sound is made ─────────────────────────────────────────────────
 * This module is the NAME and the BANK — the app state a song refers to. It is
 * audio-free on purpose, exactly like `soundfont.ts` next to it: nothing here
 * knows about `AudioBuffer`, and the engine decides what a frame becomes.
 */

/** One loaded recording: the frames, their rate, and the name a song writes. */
export interface Sample {
  /** The name the song names it by, as the app stores it (case is kept). */
  name: string;
  /** The file's own sample rate, in Hz — a WAV says, and the engine resamples. */
  rate: number;
  /**
   * One channel of frames, in -1..1, at `rate`. Mono, for the reason the header
   * gives: the channel this plays on already has a `pan`.
   */
  pcm: Float32Array;
}

/**
 * The part of a recording a note plays — its window, and the loop inside it.
 *
 * A `Sample` is the whole FILE; this is which slice of it a take uses, expressed
 * in the recording's own seconds so the audio layer can play it without knowing
 * anything about takes. `loop` false means play the window straight through (the
 * source naturally ends at `end`); true means loop between `loopStart` and
 * `loopEnd`, both inside the window. It is what makes a trim a real edit rather
 * than a picture — the engine and the offline renderer both take one of these.
 */
export interface SampleWindow {
  /** Where the played window starts, in seconds from the recording's start. */
  start: number;
  /** Where it ends, in seconds from the recording's start. */
  end: number;
  /** Whether the window repeats between the loop points. */
  loop: boolean;
  /** Where the loop starts, inside the window. Only read when `loop` is true. */
  loopStart: number;
  /** Where the loop ends, inside the window. Only read when `loop` is true. */
  loopEnd: number;
}

/** The bank the app holds: what `sample NAME` can mean, in load order. */
export type SampleBank = readonly Sample[];

/** The empty bank: a session that has imported nothing. */
export const NO_SAMPLES: SampleBank = [];

/**
 * The pitch a sample sounds at when it is played at rate 1 — middle C.
 *
 * The same convention the app's own one-shots use (see `ROOT_HZ` in
 * `audio/synth.ts`), and it is a convention rather than a measurement: a WAV
 * carries no root note, so the app has to assume one, and assuming the pitch
 * every built-in sample is written at means a loaded file behaves exactly like
 * the bank it joins. A C-4 plays the file as recorded and everything else is
 * transposed from there, which is what "play it pitched" means in a tracker.
 */
export const SAMPLE_ROOT_HZ = 261.63;

/** The longest name a song may write: one word, and short enough to read. */
export const MAX_SAMPLE_NAME = 16;

/** How many recordings the bank holds. Past this, a load is refused. */
export const MAX_SAMPLES = 8;

/** Shorter than this is a click or a mistake, not a sample. */
export const MIN_SAMPLE_SECONDS = 0.02;

/**
 * Longer than this is a track rather than a sample, and the reason the cap
 * exists: every slot is held in memory decoded, so the bank is a handful of
 * SECONDS of audio, not hours of it.
 */
export const MAX_SAMPLE_SECONDS = 30;

/** The word that takes a sample off a channel, in place of a name. */
export const NO_SAMPLE_WORD = 'none';

/** What a recording of your own arrives as. */
export const SAMPLE_FILE_EXTENSION = '.wav';
/**
 * The two spellings a file dialog should accept for one format.
 *
 * Wave files are older than the convention that settled on three letters, so
 * both are in the wild; the reader does not care, because it reads the CHUNKS
 * rather than the name.
 */
export const SAMPLE_FILE_EXTENSIONS = ['.wav', '.wave'] as const;

/** Trim a name as written, and turn runs of space into one `-`. */
export function tidySampleName(name: string): string {
  return name.trim().replace(/\s+/g, '-');
}

/** Two names mean the same recording when they say the same thing in any case. */
export function sameSampleName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * What is wrong with a name, in a sentence, or null when it is fine.
 *
 * A name is a WORD — no spaces, since a space would end it — and it starts with
 * a letter, because `sample 808` reads like a track index to a person as well as
 * to the parser. Everything a real drum folder uses is allowed after that: a
 * letter, a digit, `-`, `_`.
 */
export function sampleNameProblem(name: string): string | null {
  // Judged AS WRITTEN, and not tidied first: a space is not a name that can be
  // repaired, it is the character that ENDS one — the parser splits on it, so a
  // name reaching here with a space in it is a line the author has to fix rather
  // than one the app can guess at. `makeSample` tidies a picked FILE name before
  // it gets here, which is where "my break.wav" becomes the name `my-break`.
  if (name.trim() === '') return 'a sample name cannot be empty';
  if (name.length > MAX_SAMPLE_NAME) {
    return `a sample name is at most ${MAX_SAMPLE_NAME} characters; "${name}" is ${name.length}`;
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
    return `a sample name is a word: a letter, then letters, digits, "-" or "_"; got "${name}". A space ends the name, so a file called "my break" is named "my-break" or "MYBREAK".`;
  }
  return null;
}

/** Is this a name the app can store and a song can write? */
export function isSampleName(name: string): boolean {
  return sampleNameProblem(name) === null;
}

/** How long a sample is, in seconds — the frames it holds over its own rate. */
export function sampleSeconds(sample: Sample): number {
  return sample.rate > 0 ? sample.pcm.length / sample.rate : 0;
}

/**
 * A sample built from decoded frames, or the reason it cannot be one.
 *
 * The checks live here rather than at the file dialog so the script door, the
 * menu and a future download all refuse the same things in the same words.
 */
export function makeSample(
  name: string,
  rate: number,
  pcm: Float32Array,
): { ok: true; sample: Sample } | { ok: false; error: string } {
  const tidy = tidySampleName(name);
  const problem = sampleNameProblem(tidy);
  if (problem) return { ok: false, error: problem };
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, error: 'the file does not say what rate its samples are at.' };
  }
  if (pcm.length === 0) {
    return { ok: false, error: `"${tidy}" has no samples in it.` };
  }
  const seconds = pcm.length / rate;
  if (seconds < MIN_SAMPLE_SECONDS) {
    return {
      ok: false,
      error: `"${tidy}" is ${(seconds * 1000).toFixed(0)}ms long, and a sample has to be at least ${MIN_SAMPLE_SECONDS * 1000}ms.`,
    };
  }
  if (seconds > MAX_SAMPLE_SECONDS) {
    return {
      ok: false,
      error: `"${tidy}" is ${seconds.toFixed(1)}s long. A sample holds up to ${MAX_SAMPLE_SECONDS}s \u2014 this is a place for a hit, a stab or a hook, not a whole track.`,
    };
  }
  return { ok: true, sample: { name: tidy, rate, pcm } };
}

/** The sample a song is talking about, or null when the bank has no such name. */
export function sampleByName(bank: SampleBank, name: string | null): Sample | null {
  if (name === null) return null;
  return bank.find((sample) => sameSampleName(sample.name, name)) ?? null;
}

/** Every name in the bank, as a song could write them. */
export function sampleNames(bank: SampleBank): string[] {
  return bank.map((sample) => sample.name);
}

/**
 * Put a sample in the bank, or say why it will not fit.
 *
 * Re-loading a name REPLACES what was there — the newest file is the one you
 * just picked, which is what a person means by loading the same name twice — and
 * the bank is capped, because every slot is held decoded in memory.
 */
export function addSample(
  bank: SampleBank,
  sample: Sample,
): { ok: true; bank: Sample[]; replaced: boolean } | { ok: false; error: string } {
  const existing = sampleByName(bank, sample.name);
  if (existing) {
    return {
      ok: true,
      bank: bank.map((one) => (sameSampleName(one.name, sample.name) ? sample : one)),
      replaced: true,
    };
  }
  if (bank.length >= MAX_SAMPLES) {
    return {
      ok: false,
      error: `the sample bank is full: it holds ${MAX_SAMPLES}. Load a different name over one of them, or take one out.`,
    };
  }
  return { ok: true, bank: [...bank, sample], replaced: false };
}

/** Take a sample out of the bank. A name that is not there changes nothing. */
export function removeSample(bank: SampleBank, name: string): Sample[] {
  return bank.filter((sample) => !sameSampleName(sample.name, name));
}

/** A sample's size, as a line's second half: how long, at what rate. */
export function sampleMeta(sample: Sample): string {
  const seconds = sampleSeconds(sample);
  const rate = sample.rate >= 1000 ? `${(sample.rate / 1000).toFixed(1)}kHz` : `${Math.round(sample.rate)}Hz`;
  return `${seconds.toFixed(2)}s  \u00b7  ${rate}  \u00b7  mono`;
}

/** A sample as a line of a menu or a status line: its name, then its size. */
export function sampleLabel(sample: Sample): string {
  return `${sample.name.toUpperCase()}  \u00b7  ${sampleMeta(sample)}`;
}

/**
 * The bank as list rows, for the menu's `SAMPLES` page.
 *
 * Built here rather than in the menu, for the reason `instrumentRows` is: the
 * status line that follows a load and the list a menu draws are asking the same
 * question about the same objects, and one function answering both is what keeps
 * them from drifting apart. The `id` IS the name — a bank holds one recording per
 * name, so the name is the identity the two-press removal arms on.
 */
export interface SampleRow {
  id: string;
  name: string;
  /** `1.20s  \u00b7  44.1kHz  \u00b7  mono`, for the row's second column. */
  meta: string;
  /** True for the recording the channel in front of the user is playing. */
  active: boolean;
}

export function sampleRows(bank: SampleBank, active: string | null): SampleRow[] {
  return bank.map((sample) => ({
    id: sample.name,
    name: sample.name.toUpperCase(),
    meta: sampleMeta(sample),
    active: active !== null && sameSampleName(sample.name, active),
  }));
}
