/**
 * recorderBoard — the RECORDER page's pure arithmetic: where a handle sits, which
 * one a pointer is near, and what a drag turns into.
 *
 * ── Why this is not in the view ──────────────────────────────────────────────
 * A waveform is a picture of SECONDS, so every click on it is a conversion: an x
 * becomes a time, a time becomes an x, and a drag becomes a trimmed or looped
 * take. Those conversions are the part a person can get wrong and a test can
 * pin — so they live here, Phaser-free, and the view does nothing but move a pen.
 * It is the same split [`liveGrid`](liveGrid.ts) makes for the launch grid.
 *
 * ── Four handles, two settings ───────────────────────────────────────────────
 * The two TRIM handles choose the window that is used; the two LOOP handles
 * choose the part that repeats inside it. They are presented as one row of four so
 * a drag can pick whichever is nearest the pointer, and the take's own arithmetic
 * (`setTakeTrim`/`setTakeLoop`) is what actually clamps and orders them.
 */

import { LOUDNESS_PRESETS } from '../model/loudness';
import { setTakeLoop, setTakeTrim, takeWindow, type Take } from '../model/take';

/** The four points a pointer can grab on a take's waveform. */
export type TakeHandle = 'trimStart' | 'trimEnd' | 'loopStart' | 'loopEnd';

/** The handles in the order they read, left to right. */
export const TAKE_HANDLES: readonly TakeHandle[] = ['trimStart', 'trimEnd', 'loopStart', 'loopEnd'];

/** Whether a handle belongs to the trim window or to the loop. */
export function handleIsLoop(handle: TakeHandle): boolean {
  return handle === 'loopStart' || handle === 'loopEnd';
}

/** Where a handle sits, in seconds from the take's own start. */
export function takeHandleTime(take: Take, handle: TakeHandle): number {
  switch (handle) {
    case 'trimStart': return take.trimStart;
    case 'trimEnd': return take.trimEnd;
    case 'loopStart': return take.loopStart;
    case 'loopEnd': return take.loopEnd;
    default: return 0;
  }
}

/**
 * A time as a readout: `m:ss.mmm`, or `ss.mmm` under a minute.
 *
 * Milliseconds are kept because a trim is often a few of them — the difference
 * between a click at the front of a break and the break — and a readout that
 * rounded to tenths would hide exactly the move being made.
 */
export function formatSeconds(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const whole = Math.floor(safe);
  const millis = Math.round((safe - whole) * 1000);
  const carry = millis === 1000 ? 1 : 0;
  const ms = millis === 1000 ? 0 : millis;
  const secs = whole + carry;
  const minutes = Math.floor(secs / 60);
  const rest = secs % 60;
  const tail = `${String(Math.round(ms)).padStart(3, '0')}`;
  if (minutes === 0) return `${rest}.${tail}`;
  return `${minutes}:${String(rest).padStart(2, '0')}.${tail}`;
}

/** A horizontal span of the page a waveform is drawn in. */
export interface WaveformRect {
  x: number;
  width: number;
}

/** Where a time lands across a waveform, in pixels, clamped to the span. */
export function timeToX(seconds: number, span: number, rect: WaveformRect): number {
  const total = Number.isFinite(span) && span > 0 ? span : 0;
  const at = total === 0 ? 0 : Math.min(Math.max(seconds, 0), total) / total;
  return Math.round(rect.x + at * rect.width);
}

/** The time a pixel lands on, clamped to `0..span`. */
export function xToTime(x: number, rect: WaveformRect, span: number): number {
  const total = Number.isFinite(span) && span > 0 ? span : 0;
  if (total === 0 || rect.width <= 0) return 0;
  const at = (x - rect.x) / rect.width;
  return Math.min(Math.max(at, 0), 1) * total;
}

/** The handle nearest a time — what a pointer-down on the waveform should grab. */
export function nearestHandle(take: Take, time: number): TakeHandle {
  let best: TakeHandle = 'trimStart';
  let distance = Number.POSITIVE_INFINITY;
  for (const handle of TAKE_HANDLES) {
    const gap = Math.abs(takeHandleTime(take, handle) - time);
    // `<` so a tie keeps the earlier handle, which is the one a person grabbed.
    if (gap < distance) {
      distance = gap;
      best = handle;
    }
  }
  return best;
}

/** The next handle in the row, wrapping — the arrow keys' move. */
export function cycleHandle(handle: TakeHandle, step: number): TakeHandle {
  const at = TAKE_HANDLES.indexOf(handle);
  if (at < 0) return TAKE_HANDLES[0];
  const count = TAKE_HANDLES.length;
  const next = ((at + step) % count + count) % count;
  return TAKE_HANDLES[next];
}

/**
 * A take with one handle moved to `time`.
 *
 * The trim handles go through `setTakeTrim` and the loop handles through
 * `setTakeLoop`, so the model's clamping, ordering and loop-refit are the ones
 * that decide the result — this function chooses WHICH setting a drag moves, and
 * nothing else.
 */
export function dragHandle(take: Take, handle: TakeHandle, time: number): Take {
  switch (handle) {
    case 'trimStart': return setTakeTrim(take, time, take.trimEnd);
    case 'trimEnd': return setTakeTrim(take, take.trimStart, time);
    case 'loopStart': return setTakeLoop(take, time, take.loopEnd);
    case 'loopEnd': return setTakeLoop(take, take.loopStart, time);
    default: return take;
  }
}

/** The fraction of the take the used window covers, 0..1 — the page's dimming. */
export function windowFraction(take: Take): number {
  const window = takeWindow(take);
  return take.seconds > 0 ? Math.min(Math.max(window.seconds / take.seconds, 0), 1) : 0;
}

/** How many waveform columns a span of pixels holds, at one per two pixels. */
export function waveformColumns(width: number): number {
  return Math.max(1, Math.min(Math.round(width / 2), 512));
}

/**
 * The three writers the EXPORT SONG panel offers, each with its own one-line
 * blurb.
 *
 * The same three `F2 -> EXPORT...` runs, so an export does not care which screen
 * asked for it; the panel only spells the button and the line under it, and the
 * blurb is what the file IS (`Mixed audio`) rather than a second name for the
 * gesture. `id` is the stable key the view routes a press by.
 */
export const RECORDER_EXPORTS = [
  { id: 'wav', label: 'EXPORT WAV', blurb: 'Mixed audio' },
  { id: 'stems', label: 'STEMS ZIP', blurb: 'Separate channels' },
  { id: 'midi', label: 'EXPORT MIDI', blurb: 'Notes only' },
] as const;

/** A writer's id, as the three-entry list above spells it. */
export type RecorderExportId = (typeof RECORDER_EXPORTS)[number]['id'];

/**
 * The RENDER row's text.
 *
 * The label comes from the model (`bounceLabel`), which the file menu reads too —
 * so the region the page renders is the region the menu renders, and the two can
 * never drift. This only prefixes it with the row's name.
 */
export function recorderRenderLabel(bounce: string): string {
  return `RENDER: ${bounce}`;
}

/** The LOUDNESS row's text, for the same reason: one source, two places. */
export function recorderLoudnessLabel(loud: string): string {
  return `LOUDNESS: ${loud}`;
}

// --- zoom ------------------------------------------------------------------

/** How far the waveform can be zoomed in, as a multiple of `FIT`. */
export const ZOOM_MAX = 16;

/** A window of a recording, in seconds, that the waveform is drawn through. */
export interface TimeWindow {
  /** Where the visible window starts, in seconds from the take's own start. */
  start: number;
  /** How many seconds the window covers. */
  span: number;
}

/** A zoom level clamped to the page's range, as an integer. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.max(1, Math.min(Math.round(zoom), ZOOM_MAX));
}

/** The next zoom in or out — doubling and halving, which is what a +/− does. */
export function zoomStep(zoom: number, step: number): number {
  const at = clampZoom(zoom);
  return clampZoom(step >= 0 ? at * 2 : at / 2);
}

/**
 * The window a take is drawn through at a zoom and a centre.
 *
 * `zoom` 1 is `FIT` — the whole recording — and every step halves the span. The
 * window is clamped to the recording, and its CENTRE is nudged rather than its
 * edges, so zooming about a point keeps that point on screen: `start` is the
 * centre minus half a span, then slid back inside `0..seconds`. A take shorter
 * than nothing (a length of zero) is a window of nothing, which the view reads as
 * "draw the whole thing", and that is the honest answer for a take with no audio.
 */
export function windowAt(seconds: number, zoom: number, center: number): TimeWindow {
  const total = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const span = total === 0 ? 0 : total / clampZoom(zoom);
  if (span <= 0) return { start: 0, span: 0 };
  const at = Number.isFinite(center) ? center : total / 2;
  const start = Math.min(Math.max(at - span / 2, 0), Math.max(0, total - span));
  return { start, span };
}

/** Where a time lands across a zoomed window, in pixels, clamped to the span. */
export function windowTimeToX(time: number, win: TimeWindow, rect: WaveformRect): number {
  return timeToX(time - win.start, win.span, rect);
}

/** The time a pixel lands on across a zoomed window, clamped to the window. */
export function windowXToTime(x: number, rect: WaveformRect, win: TimeWindow): number {
  return win.start + xToTime(x, rect, win.span);
}

// --- handle stepping -------------------------------------------------------

/** How far one press of a time field's `<`/`>` moves a handle, in seconds. */
export const HANDLE_STEP_SECONDS = 0.01;

/**
 * A take with one handle nudged by a number of seconds.
 *
 * The typed-field twin of a drag: it converts a step into an absolute time and
 * hands it to `dragHandle`, so a `>` press and a drag land through exactly the
 * same clamping and ordering — a number cannot produce a window a hand cannot.
 */
export function stepTakeHandle(take: Take, handle: TakeHandle, seconds: number): Take {
  if (!Number.isFinite(seconds) || seconds === 0) return take;
  return dragHandle(take, handle, takeHandleTime(take, handle) + seconds);
}

// --- dropdowns -------------------------------------------------------------

/** A rectangle in page coordinates, for a list that has to fit on screen. */
export interface MenuRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A dropdown's open/closed state and which row it is on. */
export interface DropdownState {
  open: boolean;
  /** The highlighted row, or -1 when the list is empty. */
  row: number;
}

/** Nothing open: what a page starts in, and what Escape returns to. */
export const DROPDOWN_CLOSED: DropdownState = { open: false, row: -1 };

/** Open a dropdown on the row that is currently chosen. */
export function openDropdown(row: number, rows: number): DropdownState {
  return { open: true, row: clampRow(row, rows) };
}

/**
 * Keep a row inside a list.
 *
 * A list with nothing in it has no row, which is `-1` rather than `0`: "the first
 * row" of an empty list would be a highlight on nothing, and every caller here
 * treats -1 as "nothing highlighted, and Enter does nothing" — which is what a
 * device list with no microphones should do.
 */
export function clampRow(row: number, rows: number): number {
  const count = Math.max(0, Math.round(rows));
  if (count === 0) return -1;
  if (!Number.isFinite(row)) return 0;
  return Math.max(0, Math.min(Math.round(row), count - 1));
}

/** The next row, wrapping — the arrow keys' move through an open list. */
export function moveDropdownRow(state: DropdownState, rows: number, step: number): DropdownState {
  const count = Math.max(0, Math.round(rows));
  if (count === 0) return { open: state.open, row: -1 };
  const at = Math.max(0, clampRow(state.row, count));
  return { open: state.open, row: ((at + step) % count + count) % count };
}

/**
 * Where a dropdown's list sits: under its row, clamped so it never leaves screen.
 *
 * A menu that ran off the bottom of the page would hide the rows a person is
 * choosing between, which is the one thing a menu must not do — so when there is
 * no room BELOW the anchor it opens ABOVE it, and its x is slid back inside the
 * canvas. That is also what keeps the three lists on this page (a long device
 * name, six loudness stops) inside the same 720-wide screen as everything else,
 * whatever the theme's text scale does to their height.
 */
export function dropdownRect(anchor: MenuRect, rows: number, rowHeight: number, maxY = 405, maxX = 720): MenuRect {
  const count = Math.max(1, Math.round(rows));
  const height = count * rowHeight + 2;
  const width = anchor.width;
  const x = Math.max(0, Math.min(anchor.x, maxX - width));
  const below = anchor.y + anchor.height;
  const y = below + height <= maxY ? below : Math.max(0, anchor.y - height);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** Where one row sits inside a list. */
export function dropdownRowRect(rect: MenuRect, row: number, rowHeight: number): MenuRect {
  return { x: rect.x + 1, y: rect.y + 1 + row * rowHeight, width: rect.width - 2, height: rowHeight };
}

/** One stop in the loudness dropdown: what it reads, and what it sets. */
export interface LoudnessRow {
  /** `OFF`, or `-14 LUFS \u00b7 STREAMING`. */
  label: string;
  /** The target, or null for OFF. */
  value: number | null;
}

/**
 * The loudness dropdown's stops: OFF, then the four published targets.
 *
 * Built from the model's own `LOUDNESS_PRESETS` rather than a second list, so the
 * menu a hand picks from and the ladder a keyboard walks cannot name different
 * numbers — the same bargain `bounceLabel` keeps with the file menu.
 */
export function loudnessRows(): LoudnessRow[] {
  return [
    { label: 'OFF', value: null },
    ...LOUDNESS_PRESETS.map((preset) => ({ label: `${preset.value} LUFS  \u00b7  ${preset.what.toUpperCase()}`, value: preset.value })),
  ];
}

/** Which loudness stop a target is, or -1 when it is one of its own. */
export function loudnessRowIndex(target: number | null | undefined): number {
  return loudnessRows().findIndex((row) => row.value === (target ?? null));
}

// --- input metering --------------------------------------------------------

/** The quietest level the meter shows, in dBFS — the bottom of the scale. */
export const METER_FLOOR_DB = -48;

/** The level ticks the meter prints under its bar, in dBFS. */
export const METER_TICKS = [-48, -24, -12, 0] as const;

/** A linear peak, 0..1, as decibels full scale. */
export function peakDecibels(peak: number): number {
  if (!Number.isFinite(peak) || peak <= 0) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(Math.min(peak, 1));
}

/** `-18 dBFS`, or `-INF` for a silent input — what the readout prints. */
export function formatDbfs(peak: number): string {
  const db = peakDecibels(peak);
  if (!Number.isFinite(db)) return '-INF dBFS';
  return `${db <= -1 ? '' : '+'}${db.toFixed(0)} dBFS`;
}

/**
 * How many cells of a segmented meter are lit, from a linear peak.
 *
 * The scale is logarithmic — the same `METER_FLOOR_DB..0` the ticks name — so the
 * bar spends its length where the ear does, and a quiet-but-present signal shows
 * rather than hugging the first cell. Clamped to `0..count`.
 */
export function meterCells(peak: number, count: number): number {
  const cells = Math.max(1, Math.round(count));
  const db = peakDecibels(peak);
  if (!Number.isFinite(db)) return 0;
  const fraction = (db - METER_FLOOR_DB) / (0 - METER_FLOOR_DB);
  return Math.max(0, Math.min(cells, Math.round(fraction * cells)));
}

/** True when a peak is close enough to full scale to call it a CLIP. */
export function peakClips(peak: number): boolean {
  return Number.isFinite(peak) && peak >= 0.99;
}

/** The page's key-hint line, so the view and a test say the same thing. */
export const RECORDER_HINT = 'R RECORD   ·   ENTER GIVE TO CHANNEL   ·   DEL REMOVE   ·   TAB PICK HANDLE   ·   - + ZOOM   ·   ESC BACK';
