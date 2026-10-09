/**
 * ops/workspace — reading the TIMELINE and the WORKSPACE.
 *
 * Two reads that answer questions a single `song.describe` cannot. `arranger.*`
 * is the ARRANGER page as data: the bars of the order with the section each came
 * from, one row per channel, and every automation lane grouped by channel and
 * target with the value it resolves to on each bar it spans — the read half of
 * the screen the page draws, in the shape the page computes, so an agent and the
 * screen cannot disagree about what a lane says.
 *
 * `workspace.describe` is the cross-page answer: the full screens this build has,
 * a one-line model summary of each, and which one the caller says is showing. The
 * API is not the editor — it is a different process working on songs, not the
 * window you are looking at — so `current` is whatever `page` the caller passes,
 * validated against the same list the language accepts, and `null` when they say
 * nothing. That is the honest version of "which page is up": the one thing the API
 * cannot see is the screen, and it says so rather than guessing.
 */

import {
  AUTOMATION_TARGET_BY_ID,
  MAX_AUTOMATION_LANES,
  PAGE_NAMES,
  countMachineHits,
  createSong,
  describeMachine,
  laneLabel,
  laneScript,
  laneValueAt,
  arpLabel,
  machineBarCount,
  machineLabel,
  orderSectionLabels,
  patternRows,
  TRACK_EFFECTS,
  type AutomationLane,
  type Song,
} from '../../../src/model';
import { maybeStr, oneOf } from '../input';
import { field, schema, type ApiOperation } from '../operation';
import { ok } from '../result';
import { describeSong, songFromInput } from '../songAccess';

/** The dropdown's labels, so a page read out of the API reads like the menu. */
const PAGE_LABELS: Readonly<Record<string, string>> = {
  tracker: 'TRACKER',
  machine: 'DRUM MACHINE',
  mixer: 'MIXER',
  arranger: 'ARRANGER',
  live: 'LIVE',
  recorder: 'RECORDER',
  arp: 'ARP',
};

/** One bar of the order, with the section name that laid it out here, if any. */
function rulerBars(song: Song): { bar: number; pattern: number; section: string | null }[] {
  const labels = orderSectionLabels(song.order, song.sections, song.arrangement);
  return song.order.map((pattern, index) => ({
    bar: index + 1,
    pattern,
    section: labels[index] ?? null,
  }));
}

/**
 * Every lane grouped by the channel and target it moves, with each lane resolved
 * bar by bar.
 *
 * The resolution is the model's own `laneValueAt` at the first step of each bar,
 * so the numbers here are the numbers the engine and the offline renderer play —
 * a straight line between `from` and `to`, held at `to` once the lane's bars run
 * out. The group carries the target's range too, which is the value axis the
 * arranger draws its lanes against.
 */
function laneGroups(song: Song): unknown[] {
  const perBar = Math.max(1, patternRows(song));
  const groups = new Map<string, {
    track: number;
    trackName: string;
    target: string;
    label: string;
    range: { min: number; max: number; low: string; high: string };
    lanes: unknown[];
  }>();

  for (const lane of song.automation) {
    const info = AUTOMATION_TARGET_BY_ID[lane.target];
    const key = `${lane.track}:${lane.target}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        track: lane.track,
        trackName: song.tracks[lane.track - 1]?.name ?? `track ${lane.track}`,
        target: lane.target,
        label: info?.label ?? lane.target,
        range: { min: info?.min ?? 0, max: info?.max ?? 100, low: info?.low ?? '', high: info?.high ?? '' },
        lanes: [],
      };
      groups.set(key, group);
    }
    group.lanes.push(laneDigest(lane, perBar));
  }
  return [...groups.values()];
}

/** One lane as data: its ends, its bars, and its value on each bar it spans. */
function laneDigest(lane: AutomationLane, perBar: number): unknown {
  const values: { bar: number; value: number }[] = [];
  for (let bar = lane.startBar; bar <= lane.endBar; bar += 1) {
    const value = laneValueAt(lane, (bar - 1) * perBar, perBar);
    if (value !== null) values.push({ bar, value });
  }
  return {
    track: lane.track,
    target: lane.target,
    from: lane.from,
    to: lane.to,
    startBar: lane.startBar,
    endBar: lane.endBar,
    label: laneLabel(lane),
    script: laneScript(lane),
    values,
  };
}

export const workspaceOperations: ApiOperation[] = [
  {
    name: 'arranger.describe',
    title: 'Read the song timeline',
    summary:
      'The ARRANGER page as data: the bars of the order with the section each came from, one row per channel, and every automation lane grouped by channel and target with the value it resolves to on each bar it spans.',
    category: 'arranger',
    example: {},
    input: schema({
      song: field('object', 'The song whose timeline to read. Omit to read a blank song.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
    }),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      const description = describeSong(song);
      return ok({
        bars: song.order.length,
        tracks: song.tracks.length,
        patternRows: patternRows(song),
        maxLanes: MAX_AUTOMATION_LANES,
        laneCount: song.automation.length,
        // True when the arrangement still describes the order, so the ruler's
        // section names are real rather than blanks.
        hasArrangement: song.arrangement.length > 0,
        ruler: rulerBars(song),
        rows: description.trackList.map((row) => ({
          track: row.track,
          name: row.name,
          notes: row.notes,
          drums: row.drums,
          used: row.used,
          level: row.level,
          muted: row.muted,
        })),
        laneGroups: laneGroups(song),
      });
    },
  },
  {
    name: 'workspace.describe',
    title: 'Describe the whole workspace',
    summary:
      'The full screens this build has, a one-line model summary of each (tracker, machine, mixer, arranger, live, recorder, arp), and which page the caller says is showing — so one call answers "what is this app doing" instead of four.',
    category: 'workspace',
    example: {},
    input: schema({
      song: field('object', 'The song to summarise the workspace against. Omit for a blank song.'),
      songJson: field('string', 'The same, as the text of a .json song file.'),
      page: field('string', 'The screen the caller says is showing, e.g. "arranger". Omit when nothing is.'),
    }),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      const description = describeSong(song);
      const machine = song.machine;
      const masterEffects = TRACK_EFFECTS.filter((effect) => song.master[effect.id] > 0)
        .map((effect) => `${effect.id} ${song.master[effect.id]}`);

      const pages = PAGE_NAMES.map((id) => {
        if (id === 'tracker') {
          return {
            id,
            label: PAGE_LABELS[id],
            summary: `${description.patterns} patterns, ${description.steps} steps, ${description.bars} bars, ${description.notes} notes`,
            detail: { patterns: description.patterns, steps: description.steps, bars: description.bars, notes: description.notes, order: description.order },
          };
        }
        if (id === 'machine') {
          return {
            id,
            label: PAGE_LABELS[id],
            summary: machine ? `${machine.pads.length} pads, ${machineBarCount(machine)} bars, ${countMachineHits(machine)} hits` : 'no drum machine',
            detail: machine ? { hasMachine: true, label: machineLabel(machine), pads: machine.pads.length, bars: machineBarCount(machine), hits: countMachineHits(machine), machine: describeMachine(machine) } : { hasMachine: false },
          };
        }
        if (id === 'mixer') {
          return {
            id,
            label: PAGE_LABELS[id],
            summary: `${description.tracks} channels, ${description.buses} buses, master ${masterEffects.length > 0 ? masterEffects.join(' ') : 'clean'}`,
            detail: { channels: description.tracks, buses: description.buses, masterEffects },
          };
        }
        if (id === 'arp') {
          const arp = song.arp;
          return {
            id,
            label: PAGE_LABELS[id],
            summary: arp ? arpLabel(arp) : 'no arp dials',
            detail: arp ? { hasArp: true, label: arpLabel(arp), settings: { ...arp } } : { hasArp: false },
          };
        }
        if (id === 'live') {
          return {
            id,
            label: PAGE_LABELS[id],
            summary: song.scenes.length === 0
              ? 'no scenes'
              : `${song.scenes.length} scenes over ${description.tracks} channels`,
            detail: { scenes: song.scenes.length, names: song.scenes.map((scene) => scene.name), channels: description.tracks },
          };
        }
        if (id === 'recorder') {
          return {
            id,
            label: PAGE_LABELS[id],
            // The recorder is where audio comes IN and goes OUT: the OUT half is
            // song data (the region and the loudness), and the IN half — your
            // takes — is app state this API has never seen.
            summary: `capture in, bounce out \u2014 render ${description.bars} bars`,
            detail: { bars: description.bars, note: 'a recording lives in the app, so this API cannot see your takes; the region and loudness are in the song.' },
          };
        }
        return {
          id,
          label: PAGE_LABELS[id],
          summary: `${song.automation.length} lanes over ${description.bars} bars`,
          detail: { lanes: song.automation.length, bars: description.bars, hasArrangement: song.arrangement.length > 0 },
        };
      });

      const requested = maybeStr(input, 'page');
      const current = oneOf(requested === null ? null : requested.trim().toLowerCase(), PAGE_NAMES, 'page');

      return ok({
        current,
        pages,
        song: description,
      });
    },
  },
];
