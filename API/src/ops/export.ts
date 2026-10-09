/**
 * ops/export — getting a song OUT of the app.
 *
 * Tracklet has three ways to leave: a `.json` (the song itself), a `.mid` (the
 * NOTES, for a DAW), and a rendered `.wav` (the SOUND — for a listener, or for
 * the one thing an agent cannot do by reading: HEAR it). This file covers the
 * first two completely and is honest about the third.
 *
 * `export.midi` returns the file's bytes, base64-encoded, with the same summary
 * the app shows after a MIDI export. `export.stems` returns the PLAN for a stem
 * set — which channel becomes which file — which is the half of that feature that
 * is arithmetic rather than audio. `export.plan` describes the loop region and
 * the loudness target, and prints the two statements that set them.
 *
 * `export.audio` REFUSES here, on purpose. Rendering is `src/audio/render.ts`,
 * which needs an `OfflineAudioContext`; there is none in Node, and inventing one
 * that sounds like the app is a different, larger job. The refusal says exactly
 * that, so a caller learns the boundary instead of getting a silent file.
 */

import {
  LOUDNESS_MAX,
  LOUDNESS_MIN,
  LOUDNESS_PRESETS,
  bounceBars,
  bounceLabel,
  bounceScript,
  createSong,
  fitBounce,
  loudLabel,
  loudnessMeaning,
  loudnessScript,
  songFileStem,
  songToMidi,
  stemArchiveName,
  stemPlan,
  stemRefusal,
  type BounceRange,
} from '../../../src/model';
import { maybeNumber } from '../input';
import { refuse, ok } from '../result';
import { field, schema, type ApiOperation } from '../operation';
import { songFromInput } from '../songAccess';

/** A region from two optional fields: both ends, or nothing at all. */
function regionFrom(from: number | null, to: number | null): BounceRange | null {
  if (from === null && to === null) return null;
  if (from === null || to === null) {
    refuse('invalid_input', 'a region needs both ends: give "from" and "to" together, or neither.');
  }
  if (from > to) refuse('invalid_input', '"from" may not be after "to".');
  return { from: Math.round(from), to: Math.round(to) };
}

export const exportOperations: ApiOperation[] = [
  {
    name: 'export.midi',
    title: 'Export the song as a Standard MIDI File',
    summary: 'The notes, as a .mid: one track per channel that plays something, plus the drum machine as its own track of drum-channel hits, drums on MIDI channel 10, returned as base64 bytes with the export summary.',
    category: 'export',
    example: {},
    input: schema({
      song: field('object', 'The song to export. Omit to export a blank song (which refuses: there is nothing to write).'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
      from: field('number', 'First bar of the loop region, 1-based. Omit for the whole song.'),
      to: field('number', 'Last bar of the loop region, inclusive.'),
    }),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      const region = regionFrom(maybeNumber(input, 'from'), maybeNumber(input, 'to'));
      const result = songToMidi(song, region);
      if (!result.ok) {
        refuse('invalid_input', result.errors.join(' '));
      }
      return ok({
        bytesBase64: Buffer.from(result.bytes).toString('base64'),
        byteLength: result.bytes.length,
        summary: result.summary,
        region: region ? fitBounce(region, song.order.length) : null,
      });
    },
  },
  {
    name: 'export.stems',
    title: 'Plan a stem set',
    summary: 'The stem set as data: one .wav per channel that carries a note, its file name, and the archive they travel in. Rendering the audio is the app\'s job.',
    category: 'export',
    example: {},
    input: schema({
      song: field('object', 'The song to plan. Omit to plan a blank song (which refuses: there are no parts).'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
    }),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      const refusal = stemRefusal(song);
      if (refusal) refuse('invalid_input', refusal);
      const stem = songFileStem(song.title);
      const plan = stemPlan(song, stem);
      return ok({ stem, archive: stemArchiveName(stem), count: plan.length, entries: plan });
    },
  },
  {
    name: 'export.plan',
    title: 'Describe an export',
    summary: 'The loop region and the loudness target as data, plus the two statements that set them — the setup for an audio or MIDI export.',
    category: 'export',
    example: { from: 8, to: 15, loud: -14 },
    input: schema({
      song: field('object', 'The song, so the region can be labelled against its length. Omit for an unlabelled plan.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
      from: field('number', 'First bar of the loop region, 1-based.'),
      to: field('number', 'Last bar of the loop region, inclusive.'),
      loud: field('number', `The loudness target in LUFS, ${LOUDNESS_MIN} to ${LOUDNESS_MAX}. Omit for no normalisation.`),
    }),
    run: (input) => {
      const song = songFromInput(input);
      const region = regionFrom(maybeNumber(input, 'from'), maybeNumber(input, 'to'));
      const loud = maybeNumber(input, 'loud');
      const bars = song?.order.length ?? Math.max(region?.to ?? 1, region?.from ?? 1);
      const statements: string[] = [];
      if (region) statements.push(bounceScript(region));
      if (loud !== null) {
        if (loud < LOUDNESS_MIN || loud > LOUDNESS_MAX) {
          refuse('invalid_input', `"loud" must be between ${LOUDNESS_MIN} and ${LOUDNESS_MAX} LUFS.`);
        }
        statements.push(loudnessScript(loud));
      }
      return ok({
        region,
        regionLabel: bounceLabel(region, bars),
        bars: bounceBars(region, bars),
        loudness: loud,
        loudnessLabel: loudLabel(loud),
        loudnessMeaning: loud === null ? null : loudnessMeaning(loud),
        statements,
      });
    },
  },
  {
    name: 'export.loudness',
    title: 'The loudness ladder',
    summary: 'The four published targets the menu walks, the range a script may name, and what each one is for.',
    category: 'export',
    example: {},
    input: schema({}),
    run: () =>
      ok({
        range: { min: LOUDNESS_MIN, max: LOUDNESS_MAX },
        presets: LOUDNESS_PRESETS.map((preset) => ({ ...preset, label: loudLabel(preset.value), script: loudnessScript(preset.value) })),
      }),
  },
  {
    name: 'export.audio',
    title: 'Render audio (not available here)',
    summary: 'Would render the song to a .wav — but rendering needs a browser\'s OfflineAudioContext, so this API refuses and says so.',
    category: 'export',
    example: {},
    input: schema({
      song: field('object', 'The song that would be rendered.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
    }),
    run: () => {
      refuse(
        'unsupported',
        'audio rendering needs a browser: it uses the same OfflineAudioContext the app exports through, which does not exist in Node.',
        [
          'use the app itself (F1 → EXPORT AUDIO, or F2 → EXPORT STEMS) to render a .wav.',
          'use export.midi for the notes, and export.plan for the region and loudness settings.',
        ],
      );
    },
  },
];
