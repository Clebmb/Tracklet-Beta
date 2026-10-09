/**
 * arpBoard — the ARP page's pure arithmetic: the five dials, how one moves, and
 * the run the current chord produces.
 *
 * ── Why this is not in the view ──────────────────────────────────────────────
 * A dial is a value with an order and a range, and every nudge is a decision a
 * test can pin: which word comes after `updown`, what happens at the end of the
 * octave range, which way a gate steps. Those decisions live here, Phaser-free,
 * and the view does nothing but draw the rows and move a pen — the same split
 * [`recorderBoard`](recorderBoard.ts) and [`liveGrid`](liveGrid.ts) make.
 *
 * ── One walk, so the preview cannot lie ──────────────────────────────────────
 * The preview is not this page's own idea of an arpeggio: it calls
 * [`generateArp`](../model/arp.ts), which calls the chord modifier's own
 * `arpNotes`. So the run drawn on this page is the run `arp write` commits and the
 * run `chord … arp` writes — one function, three faces.
 */

import { ARP_DIRECTIONS } from '../model/chord';
import {
  ARP_MODES,
  MAX_ARP_GATE,
  MAX_ARP_OCTAVES,
  MAX_ARP_RATE,
  MIN_ARP_GATE,
  MIN_ARP_OCTAVES,
  MIN_ARP_RATE,
  clampArp,
  generateArp,
  type ArpDestination,
  type ArpMode,
  type ArpSettings,
  type ArpStep,
} from '../model/arp';

/** The five dials, in the order the page lists them. */
export type ArpDial = 'direction' | 'octaves' | 'rate' | 'gate' | 'mode';

export const ARP_DIALS: readonly ArpDial[] = ['direction', 'octaves', 'rate', 'gate', 'mode'];

/**
 * What each row is called.
 *
 * `RATE` and `GATE` name their UNIT rather than only themselves, because both
 * words are ambiguous in this app: rate is steps PER NOTE (not steps per beat),
 * and the gate is the one per-cell intensity a tracker cell holds — the note's
 * VELOCITY — rather than how much of a step a note sounds for. A row that said
 * `RATE` and `GATE` and nothing else would be the page's two best chances to
 * mislead.
 */
export const ARP_DIAL_LABELS: Readonly<Record<ArpDial, string>> = {
  direction: 'DIRECTION',
  octaves: 'OCTAVES',
  rate: 'RATE (STEPS PER NOTE)',
  gate: 'INTENSITY (GATE)',
  mode: 'SOURCE MODE',
};

/** How far `[`/`]` move a percentage dial in one press. */
export const GATE_STEP = 5;

/** The value of one dial, as the page prints it. */
export function dialText(settings: ArpSettings, dial: ArpDial): string {
  switch (dial) {
    case 'direction': return settings.direction.toUpperCase();
    case 'mode': return settings.mode.toUpperCase();
    case 'octaves': return String(settings.octaves);
    case 'rate': return String(settings.rate);
    case 'gate': return `${settings.gate}%`;
    default: return '';
  }
}

/** True when a dial's value is a number the page nudges by a step. */
export function dialIsNumber(dial: ArpDial): boolean {
  return dial === 'octaves' || dial === 'rate' || dial === 'gate';
}

/** The next dial down the column, wrapping — the up/down keys' move. */
export function moveDial(dial: ArpDial, step: number): ArpDial {
  const at = ARP_DIALS.indexOf(dial);
  if (at < 0) return ARP_DIALS[0];
  const count = ARP_DIALS.length;
  return ARP_DIALS[((at + step) % count + count) % count];
}

/**
 * The dials with one of them nudged.
 *
 * The two WORDS wrap through their own lists (`up → down → updown → up`), and the
 * three NUMBERS step by `step` and are CLAMPED by the model's `clampArp` — so the
 * page cannot make a setting the script or the file would refuse, and a gate of
 * `100` nudged up simply stays `100`.
 */
export function cycleDial(settings: ArpSettings, dial: ArpDial, step: number): ArpSettings {
  const direction = ARP_DIRECTIONS.indexOf(settings.direction);
  const mode = ARP_MODES.indexOf(settings.mode);
  switch (dial) {
    case 'direction':
      return clampArp({ ...settings, direction: ARP_DIRECTIONS[((direction + step) % ARP_DIRECTIONS.length + ARP_DIRECTIONS.length) % ARP_DIRECTIONS.length] });
    case 'mode':
      return clampArp({ ...settings, mode: ARP_MODES[((mode + step) % ARP_MODES.length + ARP_MODES.length) % ARP_MODES.length] });
    case 'octaves':
      return clampArp({ ...settings, octaves: settings.octaves + step });
    case 'rate':
      return clampArp({ ...settings, rate: settings.rate + step });
    case 'gate':
      return clampArp({ ...settings, gate: settings.gate + step * GATE_STEP });
    default:
      return settings;
  }
}

/**
 * One dial set to an ABSOLUTE value, clamped through the same door.
 *
 * What a dragged slider needs and a pressed key does not: a pointer names a value
 * rather than a direction, and it can arrive anywhere between the two ends of the
 * travel. The words are left alone — there is no such thing as setting DIRECTION
 * to 40 — so a slider on a word dial moves nothing, which is the honest answer.
 */
export function setDialValue(settings: ArpSettings, dial: ArpDial, value: number): ArpSettings {
  switch (dial) {
    case 'octaves': return clampArp({ ...settings, octaves: value });
    case 'rate': return clampArp({ ...settings, rate: value });
    case 'gate': return clampArp({ ...settings, gate: value });
    default: return settings;
  }
}

/** The dial's range, for a readout that teaches: `1..4`. */
export function dialRange(dial: ArpDial): string {
  switch (dial) {
    case 'octaves': return `${MIN_ARP_OCTAVES}..${MAX_ARP_OCTAVES}`;
    case 'rate': return `${MIN_ARP_RATE}..${MAX_ARP_RATE}`;
    case 'gate': return `${MIN_ARP_GATE}..${MAX_ARP_GATE}`;
    default: return '';
  }
}

/**
 * The run the dials describe for a chord starting at `row`, as the cells it
 * would write.
 *
 * `room` is how many steps the pattern has from `row`, so the run stops at the
 * pattern's edge exactly as `arp write` does — the preview and the write share
 * `generateArp` AND the same room, so neither can promise more than the other
 * does.
 */
export function arpPreview(
  tones: readonly number[],
  settings: ArpSettings,
  row: number,
  room: number,
): ArpStep[] {
  return generateArp(tones, row, settings, room);
}

/**
 * What the chord readout calls itself, which depends on where the chord came from.
 *
 * `AT CURSOR` and `FROM THE PROGRESSION` are the two answers to the same question,
 * and they are not interchangeable: one is a cell somebody typed and the other is a
 * loop the song hangs on, so a label that said `CHORD` for both would leave a
 * person looking at a cell for a chord that is not in it.
 */
export function chordCaption(mode: ArpMode): string {
  return mode === 'chord' ? 'CHORD AT CURSOR:' : 'CHORD FROM THE PROGRESSION:';
}

/**
 * What the `HEAR RUN` button says right now.
 *
 * One button, two verbs: press it and the run plays, press it again and the echo
 * stops. A single label that never changed would make the second press a guess —
 * the button would look like it was about to start a run it is already playing,
 * and a person would have no way to silence it but to leave the page.
 */
export function hearRunLabel(playing: boolean, canHear: boolean): string {
  if (playing) return '\u25a0  STOP';
  return canHear ? '\u25b6  HEAR RUN' : '\u25b6  NO RUN';
}

/** The page's key-hint line, so the view and a test say the same thing. */
export const ARP_HINT = 'ARROWS PICK CONTROL   /   [ ] CHANGE   /   ENTER HEAR   /   W WRITE   /   ESC BACK';

// --- what the page says about the dials ------------------------------------

/**
 * One line of teaching under a control, which is where this page earns its keep.
 *
 * Every one of these is a SENTENCE rather than a range: `1..4` tells a person the
 * bounds and nothing about what the number does, and `OCTAVES` alone does not say
 * whether it counts trips through the chord or how high the top note goes.
 */
export function dialCaption(settings: ArpSettings, dial: ArpDial): string {
  switch (dial) {
    case 'direction':
      return settings.direction === 'up'
        ? 'Play notes from low to high.'
        : settings.direction === 'down'
          ? 'Play notes from high to low.'
          : 'Climb the chord, then come back down.';
    case 'octaves':
      return settings.octaves === 1
        ? 'One trip through the chord.'
        : `How many trips through the chord: ${settings.octaves}.`;
    case 'rate':
      return settings.rate === 1
        ? 'One note per step.'
        : `One note every ${settings.rate} steps.`;
    case 'gate':
      return 'Sets note velocity.';
    case 'mode':
      return settings.mode === 'chord'
        ? 'Walks the chord in the cell at the cursor.'
        : 'Walks the song\u2019s progression at this row.';
    default:
      return '';
  }
}

/**
 * The dials as the PREVIEW's own summary line.
 *
 * `UP  ·  2 OCTAVES  ·  EVERY 2 STEPS  ·  VELOCITY 75%` — the run described in the
 * words the grid is played in, so a glance at the bottom of the preview says what
 * the picture above it is. Built here rather than in the view for the reason every
 * label in this app is: the tests and the screen read one string.
 */
export function arpSummary(settings: ArpSettings): string {
  const octaves = settings.octaves === 1 ? '1 OCTAVE' : `${settings.octaves} OCTAVES`;
  const every = settings.rate === 1 ? 'EVERY STEP' : `EVERY ${settings.rate} STEPS`;
  return [settings.direction.toUpperCase(), octaves, every, `VELOCITY ${settings.gate}%`].join('  \u00b7  ');
}

/** A row number as the grid prints it: `00`, `10`. */
export function formatRow(row: number): string {
  return String(Math.max(0, Math.round(row))).padStart(2, '0');
}

/**
 * Where a write is aimed, in one line: `PAT 1  ·  TRACK 3  ·  ROWS 00 \u2013 10`.
 *
 * The destination BEFORE anything is committed. A page that writes notes has to
 * say which pattern, which channel and which rows it is about to land on, because
 * the one thing a person cannot undo is not knowing what happened.
 */
export function arpDestinationLine(destination: ArpDestination): string {
  const pattern = destination.pattern + 1;
  const track = destination.track + 1;
  const rows = destination.cells === 0
    ? `ROW ${formatRow(destination.row)}`
    : `ROWS ${formatRow(destination.row)} \u2013 ${formatRow(destination.lastRow)}`;
  return `PAT ${pattern}  \u00b7  TRACK ${track}  \u00b7  ${rows}`;
}

/**
 * What a write would do to the cells it lands on, in one line.
 *
 * "6 generated cells" is the count of notes; the second half is the part that
 * matters, and it is honest in both directions — a run over empty rows says so,
 * and a run over notes says how many it replaces. `WRITE RUN` is destructive to
 * exactly those cells and to nothing else, which is what "one undo step" means.
 */
export function arpReplaceNote(destination: ArpDestination): string {
  if (destination.cells === 0) return 'Nothing to write \u2014 the run is empty.';
  const cells = `${destination.cells} generated ${destination.cells === 1 ? 'cell' : 'cells'}`;
  if (destination.replaced === 0) return `${cells}  \u00b7  the rows they land on are empty.`;
  return `${cells}  \u00b7  ${destination.replaced} ${destination.replaced === 1 ? 'note' : 'notes'} at those rows ${destination.replaced === 1 ? 'is' : 'are'} replaced.`;
}

/**
 * Cut a string to what fits a width, with an ellipsis when something was lost.
 *
 * The page prints words a song owns — a progression can be sixteen chords, a
 * refusal can be a whole sentence — and a fixed panel is not allowed to spill. So
 * every such string goes through here rather than being trusted to be short, which
 * is what keeps a long name from drawing over its neighbour.
 */
export function fitText(text: string, widthPx: number, size: number): string {
  const perChar = Math.max(1, size * 0.62);
  const room = Math.max(1, Math.floor(widthPx / perChar));
  if (text.length <= room) return text;
  if (room <= 1) return text.slice(0, 1);
  return `${text.slice(0, room - 1)}\u2026`;
}

// --- the pitch-versus-step preview ---------------------------------------

/** A rectangle in canvas pixels. The board's own, so it stays Phaser-free. */
export interface RollRect { x: number; y: number; width: number; height: number; }

/** One pitch of the run, as a row of the roll: highest at the top. */
export interface RollRow {
  /** The MIDI note this row is. */
  pitch: number;
  /** The row's top, in canvas pixels. */
  y: number;
  /** The row's height, in canvas pixels. */
  height: number;
}

/** One step of the pattern, as a column of the roll. */
export interface RollColumn {
  /** The row of the pattern, 0-based from the pattern's own start. */
  step: number;
  /** The column's left, in canvas pixels. */
  x: number;
  /** The column's width, in canvas pixels. */
  width: number;
}

/**
 * The roll's geometry: one row per pitch the run uses, one column per pattern
 * step in the window.
 *
 * ── Why the rows are the run's own pitches ────────────────────────────────
 * A semitone-accurate piano roll needs about two octaves of rows, and at this
 * panel's height each would be three pixels — a picture of a keyboard rather than
 * of a run. One row per pitch the run actually sounds is bounded by the run itself
 * (`tones \u00d7 octaves`), so a three-note chord over two octaves is the six rows
 * the page shows, and the shape of the run is legible at every setting.
 *
 * ── And why the columns are a window ─────────────────────────────────────
 * A pattern can be 64 steps long; 64 columns in 300 pixels is five pixels of note
 * block. So the roll shows at most `maxColumns` steps of the pattern, slid so that
 * the run's own start row is always on screen — the one column a person must be
 * able to see, since it is where the write begins.
 */
export interface RollGrid {
  /** The pitch rows, highest first. */
  rows: RollRow[];
  /** The step columns, left to right. */
  columns: RollColumn[];
  /** The height of one row, in canvas pixels. */
  rowHeight: number;
  /** Whether a note's name fits inside a block, so the view knows to draw it. */
  labelBlocks: boolean;
  /** Whether the rows are tall enough to name on the axis without colliding. */
  labelRows: boolean;
}

/** The most steps the roll draws at once — past this a note block is a sliver. */
export const MAX_ROLL_STEPS = 32;

/**
 * Which steps of a pattern the roll shows, and where the window starts.
 *
 * A pattern that fits is shown WHOLE, from its first step — the common case, and
 * the one where "where am I" is answered by the pattern rather than by a scroll.
 * A longer one is shown as a window of `maxColumns` steps that always contains
 * `row`, pinned to the end when the run starts too late for a full window to fit.
 */
export function rollWindow(rows: number, row: number, maxColumns = MAX_ROLL_STEPS): number {
  const total = Math.max(0, Math.round(rows));
  const most = Math.max(1, Math.round(maxColumns));
  if (total <= most) return 0;
  return Math.max(0, Math.min(Math.max(0, Math.round(row)), total - most));
}

/**
 * Lay the roll out inside a rect: the pitch rows, the step columns, and whether
 * anything is wide or tall enough to be labelled.
 *
 * `pitches` is every note the run sounds — duplicates are dropped, because two
 * chord tones an octave apart are two rows and two runs of the same pitch are one
 * row played twice.
 */
export function rollGrid(pitches: readonly number[], rows: number, rect: RollRect, row = 0): RollGrid {
  const distinct = [...new Set(pitches)].sort((a, b) => b - a);
  const count = Math.max(1, distinct.length);
  const rowHeight = Math.max(1, Math.floor(rect.height / count));
  const pitchRows: RollRow[] = (distinct.length === 0 ? [0] : distinct).map((pitch, index) => ({
    pitch,
    y: rect.y + index * rowHeight,
    height: rowHeight,
  }));

  const from = rollWindow(rows, row);
  const shown = Math.max(1, Math.min(Math.max(1, Math.round(rows)), MAX_ROLL_STEPS));
  const columnWidth = rect.width / shown;
  const columns: RollColumn[] = [];
  for (let i = 0; i < shown; i++) {
    columns.push({ step: from + i, x: rect.x + i * columnWidth, width: columnWidth });
  }

  return {
    rows: pitchRows,
    columns,
    rowHeight,
    // A block needs room for `C#4` at the page's smallest type, which is about 15
    // pixels; a column narrower than that would print a smear rather than a name.
    labelBlocks: columnWidth >= 15,
    // Labels collide below about nine pixels of row, so the axis goes unlabelled
    // rather than printing two note names on top of each other.
    labelRows: rowHeight >= 9,
  };
}

/**
 * The block for one note of the run, or null when it is off the roll.
 *
 * The block fills most of its column rather than all of it, so consecutive notes
 * stay two blocks rather than one bar, and it is never thinner than a pixel or two
 * however short the column is.
 */
export function rollBlock(grid: RollGrid, step: number, pitch: number): RollRect | null {
  const column = grid.columns.find((one) => one.step === step);
  const row = grid.rows.find((one) => one.pitch === pitch);
  if (!column || !row) return null;
  const inset = column.width >= 8 ? 1 : 0;
  return {
    x: Math.round(column.x + inset),
    y: Math.round(row.y),
    width: Math.max(2, Math.round(column.width - inset * 2)),
    height: Math.max(2, Math.round(row.height) - 1),
  };
}

/** The x of a step's column centre, for the step ruler's numbers. */
export function rollStepCenter(grid: RollGrid, step: number): number | null {
  const column = grid.columns.find((one) => one.step === step);
  return column ? column.x + column.width / 2 : null;
}

// --- the intensity slider --------------------------------------------------

/**
 * Where the knob sits for a value, as an x inside the track.
 *
 * `0..100` maps to the track's two ends, so the ends of the travel ARE the ends of
 * the range and a person can read the value off the knob's position. The knob is
 * as wide as it is tall, so its CENTRE is what the value names rather than its
 * left edge — which is the difference between a slider that looks right at 0 and
 * one that looks right at 100.
 */
export function sliderKnobX(rect: RollRect, value: number, knob: number, min = MIN_ARP_GATE, max = MAX_ARP_GATE): number {
  const span = Math.max(1, max - min);
  const part = Math.min(1, Math.max(0, (value - min) / span));
  const travel = Math.max(0, rect.width - knob);
  return Math.round(rect.x + knob / 2 + part * travel);
}

/** The value a pointer at `x` picks, snapped to `step` and clamped to the range. */
export function sliderValueAt(
  x: number,
  rect: RollRect,
  knob: number,
  step = GATE_STEP,
  min = MIN_ARP_GATE,
  max = MAX_ARP_GATE,
): number {
  const travel = Math.max(0, rect.width - knob);
  if (travel === 0) return clampArp({ gate: max }).gate;
  const part = Math.min(1, Math.max(0, (x - rect.x - knob / 2) / travel));
  const raw = min + part * (max - min);
  const snapped = Math.round(raw / step) * step;
  return clampArp({ gate: snapped }).gate;
}
