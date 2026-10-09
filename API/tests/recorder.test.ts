/**
 * The RECORDER page over the API: the IN half as data, a capture plan, and two
 * honest refusals.
 *
 * The claim this file holds to is that this API never pretends to hold audio. A
 * take and its recording are app state, so:
 *
 *   • `recorder.describe` resolves the takes a caller HANDS IT — the model's own
 *     window and loop arithmetic — lists the recordings a song references, and
 *     reports the bank's limits, saying plainly that the capture is the browser's;
 *   • `recorder.plan` answers what a capture WOULD do (input, length, name, where
 *     it lands) without recording anything;
 *   • `recorder.capture` and `sample.load` REFUSE with the reason, the
 *     `export.audio` precedent on the way in;
 *   • `workspace.describe` names the recorder page, and `script.apply` reports the
 *     `record`/`page` settings a script asked for rather than performing them.
 */

import { describe, expect, it } from 'vitest';

import { callOperation } from '../src/index';
import {
  applyScript,
  createSong,
  MAX_SAMPLES,
  MAX_SAMPLE_SECONDS,
  songToJson,
  type Song,
} from '../../src/model';

const SOURCE = [
  'new',
  'song "RECORDER TEST"',
  'steps 16',
  'tracks 2',
  'track 1 "BASS" voice bass',
  'track 2 "HOOK" wave sample duty 10 sample BRK02',
  'machine steps 16',
  'pad 1 "BRK" wave sample sample HOOK2 pattern "9...9...9...9..."',
  'pattern 1 "A"',
  'C-2 .',
  '',
].join('\n');

function subject(): Song {
  const applied = applyScript(createSong(), SOURCE);
  if (!applied.ok) throw new Error(`the fixture must parse: ${JSON.stringify(applied.errors)}`);
  return applied.song;
}

interface TakeDigest {
  name: string;
  seconds: number;
  peak: number;
  window: { start: number; end: number; seconds: number };
  loop: { start: number; end: number; seconds: number } | null;
  trimmed: boolean;
  looped: boolean;
  label: string;
  meta: string;
  script: string[];
}

interface RecorderDescription {
  available: boolean;
  reason: string | null;
  limits: { samples: number; nameChars: number; seconds: { min: number; max: number }; rootHz: number };
  takes: TakeDigest[];
  count: number;
  references: { name: string; where: string }[];
  note: string;
}

interface CapturePlan {
  available: boolean;
  reason: string | null;
  device: { input: string; available: boolean; reason: string | null };
  name: string;
  seconds: number | null;
  replaces: boolean;
  bankFull: boolean;
  landsIn: string;
  script: string;
  steps: string[];
  note: string;
}

async function describeRecorder(input: Record<string, unknown> = {}): Promise<RecorderDescription> {
  const result = await callOperation('recorder.describe', input);
  if (!result.ok) throw new Error(`recorder.describe failed: ${JSON.stringify(result.error)}`);
  return result.result as RecorderDescription;
}

async function planCapture(input: Record<string, unknown> = {}): Promise<CapturePlan> {
  const result = await callOperation('recorder.plan', input);
  if (!result.ok) throw new Error(`recorder.plan failed: ${JSON.stringify(result.error)}`);
  return result.result as CapturePlan;
}

describe('recorder.describe resolves the takes it is given', () => {
  it('reads a fresh take as the whole recording, unlooped', async () => {
    const read = await describeRecorder({ takes: [{ name: 'HOOK', seconds: 2.4, peak: 0.9 }] });
    expect(read.count).toBe(1);
    const take = read.takes[0];
    expect(take?.name).toBe('HOOK');
    expect(take?.window).toEqual({ start: 0, end: 2.4, seconds: 2.4 });
    expect(take?.loop).toBeNull();
    expect(take?.trimmed).toBe(false);
    expect(take?.looped).toBe(false);
    expect(take?.script).toEqual([]);
  });

  it('trims and loops a take through the model\'s own arithmetic', async () => {
    const read = await describeRecorder({
      takes: [{ name: 'HOOK', seconds: 3, trimStart: 0.5, trimEnd: 2.5, loopStart: 1, loopEnd: 2 }],
    });
    const take = read.takes[0];
    expect(take?.window).toEqual({ start: 0.5, end: 2.5, seconds: 2 });
    expect(take?.loop).toEqual({ start: 1, end: 2, seconds: 1 });
    expect(take?.trimmed).toBe(true);
    expect(take?.looped).toBe(true);
    expect(take?.script).toEqual(['record trim HOOK 0.5 2.5', 'record loop HOOK 1 2']);
    expect(take?.label).toContain('HOOK');
  });

  it('orders the two ends the way a drag would, and clamps past the end', async () => {
    // Written backwards, and a loop that runs past the window: the model orders
    // and clamps, which is the whole reason this goes through it.
    const read = await describeRecorder({ takes: [{ name: 'X', seconds: 1, trimStart: 0.8, trimEnd: 0.2, loopStart: 0, loopEnd: 9 }] });
    expect(read.takes[0]?.window.start).toBe(0.2);
    expect(read.takes[0]?.window.end).toBe(0.8);
    expect(read.takes[0]?.window.seconds).toBeCloseTo(0.6, 6);
    // A loop spanning the whole window reads as no loop.
    expect(read.takes[0]?.loop).toBeNull();
  });

  it('lists the recordings a song references, with where', async () => {
    const read = await describeRecorder({ song: subject() });
    expect(read.references).toEqual([
      { name: 'BRK02', where: 'channel 2' },
      { name: 'HOOK2', where: 'pad 1' },
    ]);
  });

  it('publishes the bank limits and says the capture is the browser\'s', async () => {
    const read = await describeRecorder();
    expect(read.available).toBe(false);
    expect(read.reason).not.toBeNull();
    expect(read.limits.samples).toBe(MAX_SAMPLES);
    expect(read.limits.seconds.max).toBe(MAX_SAMPLE_SECONDS);
    expect(read.note).toContain('app');
  });

  it('refuses a take whose name could never be written', async () => {
    const result = await callOperation('recorder.describe', { takes: [{ name: '02-brk', seconds: 1 }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
  });
});

describe('recorder.plan stages a capture without recording', () => {
  it('names the input unavailable and clamps the length', async () => {
    const plan = await planCapture({ name: 'HOOK', seconds: 900 });
    expect(plan.available).toBe(false);
    expect(plan.reason).not.toBeNull();
    expect(plan.device.input).toBe('microphone');
    expect(plan.device.available).toBe(false);
    expect(plan.seconds).toBe(MAX_SAMPLE_SECONDS);
    expect(plan.name).toBe('HOOK');
    expect(plan.script).toBe('record HOOK');
    expect(plan.note).toContain('records nothing');
  });

  it('suggests a fresh name and notices one it would replace', async () => {
    const empty = await planCapture();
    expect(empty.name).toBe('TAKE-1');
    expect(empty.replaces).toBe(false);

    const taken = await planCapture({ takes: [{ name: 'TAKE-1', seconds: 1 }] });
    expect(taken.name).toBe('TAKE-2');

    const replacing = await planCapture({ name: 'HOOK', takes: [{ name: 'HOOK', seconds: 1 }] });
    expect(replacing.replaces).toBe(true);
  });

  it('says when the bank is full', async () => {
    const takes = Array.from({ length: MAX_SAMPLES }, (_one, index) => ({ name: `T${index}`, seconds: 1 }));
    const plan = await planCapture({ name: 'NEW', takes });
    expect(plan.bankFull).toBe(true);
    expect(plan.steps.join(' ')).toContain('full');
  });

  it('refuses a capture name that could never be written', async () => {
    const result = await callOperation('recorder.plan', { name: '02brk' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
  });
});

describe('the two audio-IN calls refuse, the export.audio precedent', () => {
  it('refuses a capture with the browser reason', async () => {
    const result = await callOperation('recorder.capture', { name: 'HOOK' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('unsupported');
    expect(result.error.details?.join(' ')).toContain('browser');
  });

  it('refuses a sample load with the app-state reason', async () => {
    const result = await callOperation('sample.load', { path: 'samples/break.wav' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('unsupported');
    expect(result.error.message).toContain('app state');
    expect(result.error.details?.join(' ')).toContain('sample NAME');
  });
});

describe('the recorder is reachable from the rest of the surface', () => {
  it('is a page workspace.describe names, with its honest note', async () => {
    const result = await callOperation('workspace.describe', { song: subject() });
    if (!result.ok) throw new Error('workspace.describe failed');
    const pages = (result.result as { pages: { id: string; summary: string; detail: Record<string, unknown> }[] }).pages;
    const recorder = pages.find((page) => page.id === 'recorder');
    expect(recorder).toBeDefined();
    expect(recorder?.detail.note).toContain('cannot see your takes');
  });

  it('reports the record and page settings a script asked for, without performing them', async () => {
    const script = 'new\nsong "X"\nsteps 16\ntracks 1\ntrack 1 "LEAD" voice lead\npattern 1 "A"\nC-4\nrecord trim HOOK 0.1 2.0\nrecord select HOOK\npage recorder\n';
    const result = await callOperation('script.apply', { script });
    if (!result.ok) throw new Error(`script.apply failed: ${JSON.stringify(result.error)}`);
    const settings = (result.result as { settings: { recordTrims?: unknown; recordSelect?: string; page?: string } }).settings;
    expect(settings.recordTrims).toEqual([{ name: 'HOOK', start: 0.1, end: 2 }]);
    expect(settings.recordSelect).toBe('HOOK');
    expect(settings.page).toBe('recorder');
    // And the song the script built is unaffected by the app-state lines.
    const json = songToJson((result.result as { song: Song }).song, { volume: null });
    expect(json).not.toContain('record');
  });

  it('lists every recorder operation in the registry', async () => {
    const result = await callOperation('api.describe', {});
    if (!result.ok) throw new Error('api.describe failed');
    const names = (result.result as { operations: { name: string }[] }).operations.map((operation) => operation.name);
    for (const name of ['recorder.describe', 'recorder.plan', 'recorder.capture', 'sample.load']) {
      expect(names).toContain(name);
    }
  });
});
