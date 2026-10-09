/**
 * ops/language — asking the build what it speaks.
 *
 * These are the operations an agent should call FIRST, before writing a line of
 * Tracklet Script, because the alternative is guessing a version. Every answer
 * here is built from the model's own tables (`scriptCapabilities`,
 * `instrumentCatalog`), so it cannot describe a language this build does not
 * speak — which is exactly the failure mode a hand-written reference has.
 *
 * There are no arguments to get wrong, and that is deliberate: asking what this
 * build can do should never be the thing that fails.
 */

import {
  GENRES,
  SCRIPT_COMMANDS,
  SCRIPT_EXAMPLE,
  SCRIPT_QUICK_REFERENCE,
  SCRIPT_RULE_OF_THUMB,
  SCRIPT_VERSION,
  genreFromName,
  genreScript,
  instrumentCatalog,
  scriptCapabilities,
} from '../../../src/model';
import { maybeStr, oneOf, str } from '../input';
import { refuse, ok } from '../result';
import { field, schema, type ApiOperation } from '../operation';

interface SearchHit {
  kind: string;
  id: string;
  label?: string;
  blurb: string;
}

/** Everything the vocabulary knows, flattened into things a query can match. */
function vocabularyHits(): SearchHit[] {
  const vocabulary = scriptCapabilities().vocabulary;
  const hits: SearchHit[] = [
    ...vocabulary.waves.map((id) => ({ kind: 'wave', id, blurb: 'an oscillator shape' })),
    ...vocabulary.voices.map((id) => ({ kind: 'voice', id, blurb: 'a built-in channel sound' })),
    ...vocabulary.knobs.map((knob) => ({ kind: 'knob', id: knob.id, label: knob.high, blurb: `${knob.low} to ${knob.high}` })),
    ...vocabulary.tunings.map((id) => ({ kind: 'tuning', id, blurb: 'a temperament' })),
    ...vocabulary.grooves.map((groove) => ({ kind: 'groove', id: groove.id, blurb: 'a named feel' })),
    ...vocabulary.kits.map((kit) => ({ kind: 'kit', id: kit.id, label: kit.label, blurb: kit.blurb })),
    ...vocabulary.chips.map((id) => ({ kind: 'chip', id, blurb: 'a games console profile' })),
    ...vocabulary.scales.map((id) => ({ kind: 'scale', id, blurb: 'a key and scale a song may state' })),
    ...vocabulary.effects.map((id) => ({ kind: 'effect', id, blurb: 'a one-knob channel effect' })),
    ...vocabulary.filterShapes.map((shape) => ({ kind: 'shape', id: shape.id, blurb: 'a filter shape for `bright`' })),
    ...vocabulary.drums.map((drum) => ({ kind: 'drum', id: drum.id, label: drum.label, blurb: drum.blurb })),
    ...vocabulary.arpDirections.map((dir) => ({ kind: 'arp', id: dir.id, blurb: 'a direction an arpeggio walks' })),
    ...vocabulary.rowTransforms.map((row) => ({ kind: 'row transform', id: row.id, blurb: row.what })),
    ...vocabulary.grids.map((id) => ({ kind: 'grid', id, blurb: 'the bar as note values' })),
    ...vocabulary.automationTargets.map((target) => ({
      kind: 'automation target',
      id: target.id,
      label: `${target.min}..${target.max}`,
      blurb: `${target.scope}: ${target.low} to ${target.high}`,
    })),
  ];
  // The catalog is the other half — the same words with a longer sentence about
  // each — so its blurbs win where both have an entry, and a word the vocabulary
  // does not list (a voice family, say) still appears.
  const catalog = instrumentCatalog();
  for (const voice of catalog.voices) hits.push({ kind: 'voice', id: voice.id, label: voice.label, blurb: voice.blurb });
  for (const wave of catalog.waves) hits.push({ kind: 'wave', id: wave.id, label: wave.label, blurb: wave.blurb });
  for (const effect of catalog.effects) hits.push({ kind: 'effect', id: effect.id, label: effect.label, blurb: effect.blurb });
  for (const shape of catalog.shapes) hits.push({ kind: 'shape', id: shape.id, label: shape.label, blurb: shape.blurb });
  for (const kit of catalog.kits) hits.push({ kind: 'kit', id: kit.id, label: kit.label, blurb: kit.blurb });
  return hits;
}

export const languageOperations: ApiOperation[] = [
  {
    name: 'language.capabilities',
    title: 'The whole language manifest',
    summary: 'Everything this build of Tracklet Script speaks: version, keywords, commands with examples, limits and closed lists.',
    category: 'language',
    example: {},
    input: schema({}),
    run: () => ok(scriptCapabilities()),
  },
  {
    name: 'language.limits',
    title: 'Every number the language clamps to',
    summary: 'The ranges — tracks, steps, tempo, poly, lanes and the rest — named the way an author says them.',
    category: 'language',
    example: {},
    input: schema({}),
    run: () => ok(scriptCapabilities().limits),
  },
  {
    name: 'language.vocabulary',
    title: 'Every closed word list',
    summary: 'The waves, voices, knobs, feels, kits, chips, scales, effects, drums and directions a script may name.',
    category: 'language',
    example: {},
    input: schema({}),
    run: () => ok(scriptCapabilities().vocabulary),
  },
  {
    name: 'language.commands',
    title: 'Every command word, with an example',
    summary: 'One row per keyword: its tier (core or deep), what it is for, and a line that parses.',
    category: 'language',
    example: { tier: 'core' },
    input: schema({
      tier: field('string', 'Only the words at this depth: core (write a song) or deep (sound design and session settings).', {
        enum: ['core', 'deep'],
      }),
    }),
    run: (input) => {
      const tier = oneOf(maybeStr(input, 'tier') ?? 'core', ['core', 'deep'] as const, 'tier');
      const commands = SCRIPT_COMMANDS.filter((command) => command.tier === tier);
      return ok({ tier, commands });
    },
  },
  {
    name: 'language.catalog',
    title: 'The instrument catalog',
    summary: 'One level below the vocabulary: what every wave, voice, knob, console, kit and effect IS, with the blurb saying when to reach for it.',
    category: 'language',
    example: {},
    input: schema({}),
    run: () => ok(instrumentCatalog()),
  },
  {
    name: 'language.quick_reference',
    title: 'The paste-box cheat sheet',
    summary: 'A short reference in which every command word appears at least once, plus the one-line rule of thumb.',
    category: 'language',
    example: {},
    input: schema({}),
    run: () => ok({ version: SCRIPT_VERSION, lines: [...SCRIPT_QUICK_REFERENCE], rule: SCRIPT_RULE_OF_THUMB }),
  },
  {
    name: 'language.example',
    title: 'A known-good example script',
    summary: 'The language\'s own load-example script — a whole song that is applied by a test, so it cannot rot.',
    category: 'language',
    example: {},
    input: schema({}),
    run: () => ok({ script: SCRIPT_EXAMPLE }),
  },
  {
    name: 'language.starters',
    title: 'The genre starters',
    summary: 'Every whole worked skeleton a `start` word writes — house, lofi, ballad, rock, emo, vaporwave, synthwave, shoegaze, dnb — each with what it is for.',
    category: 'language',
    example: {},
    input: schema({}),
    run: () => ok({ starters: GENRES.map((genre) => ({ id: genre.id, label: genre.label, blurb: genre.blurb })) }),
  },
  {
    name: 'language.starter',
    title: 'One genre starter, as a script',
    summary: 'The full Tracklet Script one `start` word writes — a skeleton to edit rather than invent.',
    category: 'language',
    example: { id: 'house' },
    input: schema({ id: field('string', 'Which starter, e.g. house, rock or vaporwave.', { enum: GENRES.map((g) => g.id) }) }, ['id']),
    run: (input) => {
      const id = str(input, 'id');
      if (!genreFromName(id)) {
        refuse('not_found', `there is no starter called "${id}".`, [`the starters are: ${GENRES.map((g) => g.id).join(', ')}`]);
      }
      return ok({ id, script: genreScript(id) });
    },
  },
  {
    name: 'language.search',
    title: 'Search the vocabulary',
    summary: 'Find a word by name or description across every closed list — useful when you know the sound you want but not its name.',
    category: 'language',
    example: { query: 'bass' },
    input: schema({ query: field('string', 'Text to look for in a word or its description, case-insensitively.') }, ['query']),
    run: (input) => {
      const query = str(input, 'query').trim().toLowerCase();
      if (query === '') refuse('invalid_input', '"query" may not be empty.');
      const hits = [
        ...SCRIPT_COMMANDS.filter(
          (command) => command.word.includes(query) || command.what.toLowerCase().includes(query),
        ).map((command) => ({ kind: 'command', id: command.word, blurb: command.what, example: command.example })),
        ...vocabularyHits().filter(
          (hit) => hit.id.toLowerCase().includes(query) || hit.blurb.toLowerCase().includes(query) || hit.label?.toLowerCase().includes(query),
        ),
      ];
      // Commands first (a word you type), then the closed lists, each already in
      // the model's own order — no scoring, because a list this small reads better
      // in its natural order than by a number nobody can predict.
      return ok({ query, count: hits.length, hits });
    },
  },
];
