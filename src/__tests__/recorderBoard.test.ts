import { describe, expect, it } from 'vitest';

import { makeTake, setTakeLoop, setTakeTrim, takeWindow } from '../model/take';
import {
  clampRow,
  clampZoom,
  cycleHandle,
  dragHandle,
  dropdownRect,
  dropdownRowRect,
  loudnessRowIndex,
  loudnessRows,
  moveDropdownRow,
  openDropdown,
  formatDbfs,
  formatSeconds,
  handleIsLoop,
  meterCells,
  nearestHandle,
  peakClips,
  recorderLoudnessLabel,
  recorderRenderLabel,
  RECORDER_EXPORTS,
  RECORDER_HINT,
  METER_FLOOR_DB,
  METER_TICKS,
  stepTakeHandle,
  takeHandleTime,
  TAKE_HANDLES,
  timeToX,
  waveformColumns,
  windowAt,
  windowFraction,
  windowTimeToX,
  windowXToTime,
  xToTime,
  zoomStep,
} from '../ui/recorderBoard';

/**
 * The RECORDER page's arithmetic — the part of the waveform a test can pin.
 *
 * A waveform is a picture of seconds, so a click is a conversion and a drag is a
 * setting. These tests hold the two halves: that a time and an x always agree
 * (including at the edges), and that moving a handle lands in the RIGHT setting —
 * a trim handle trims, a loop handle loops — with the model's own clamping.
 */

const RECT = { x: 100, width: 200 };
const take = () => makeTake('HOOK', 10, 0.5);

describe('a time reads as a clock', () => {
  it('shows seconds and milliseconds under a minute', () => {
    expect(formatSeconds(0)).toBe('0.000');
    expect(formatSeconds(1.25)).toBe('1.250');
    expect(formatSeconds(0.007)).toBe('0.007');
  });

  it('shows minutes once there are some', () => {
    expect(formatSeconds(65.5)).toBe('1:05.500');
  });

  it('carries a rounded thousandth into the second', () => {
    expect(formatSeconds(59.9996)).toBe('1:00.000');
  });

  it('treats a non-number as zero', () => {
    expect(formatSeconds(Number.NaN)).toBe('0.000');
    expect(formatSeconds(-4)).toBe('0.000');
  });
});

describe('a time and a pixel agree', () => {
  it('maps a time across the span', () => {
    expect(timeToX(0, 10, RECT)).toBe(100);
    expect(timeToX(5, 10, RECT)).toBe(200);
    expect(timeToX(10, 10, RECT)).toBe(300);
  });

  it('maps a pixel back to a time', () => {
    expect(xToTime(100, RECT, 10)).toBe(0);
    expect(xToTime(200, RECT, 10)).toBe(5);
    expect(xToTime(300, RECT, 10)).toBe(10);
  });

  it('clamps both ends, so a drag past the edge is the edge', () => {
    expect(timeToX(-3, 10, RECT)).toBe(100);
    expect(timeToX(99, 10, RECT)).toBe(300);
    expect(xToTime(0, RECT, 10)).toBe(0);
    expect(xToTime(999, RECT, 10)).toBe(10);
  });

  it('answers zero for an empty take', () => {
    expect(timeToX(1, 0, RECT)).toBe(100);
    expect(xToTime(200, RECT, 0)).toBe(0);
  });
});

describe('a pointer grabs the nearest handle', () => {
  it('chooses by time across all four handles', () => {
    // Trim the window first, THEN loop inside it — a trim resets the loop to the
    // window, so the order matters (and this pins that it does).
    const one = setTakeLoop(setTakeTrim(take(), 2, 8), 3, 7);
    expect(takeHandleTime(one, 'trimStart')).toBe(2);
    expect(takeHandleTime(one, 'trimEnd')).toBe(8);
    expect(takeHandleTime(one, 'loopStart')).toBe(3);
    expect(takeHandleTime(one, 'loopEnd')).toBe(7);
    expect(nearestHandle(one, 2.1)).toBe('trimStart');
    expect(nearestHandle(one, 7.8)).toBe('trimEnd');
    expect(nearestHandle(one, 3.1)).toBe('loopStart');
    expect(nearestHandle(one, 6.9)).toBe('loopEnd');
  });

  it('breaks a tie toward the earlier handle', () => {
    const one = setTakeLoop(setTakeTrim(take(), 2, 8), 3, 7);
    // 7.5 is half a second from both trimEnd (8) and loopEnd (7).
    expect(nearestHandle(one, 7.5)).toBe('trimEnd');
  });

  it('knows which handles are the loop', () => {
    expect(handleIsLoop('trimStart')).toBe(false);
    expect(handleIsLoop('loopEnd')).toBe(true);
  });
});

describe('a handle moves through the row', () => {
  it('steps and wraps in both directions', () => {
    expect(cycleHandle('trimStart', 1)).toBe('trimEnd');
    expect(cycleHandle('loopEnd', 1)).toBe('trimStart');
    expect(cycleHandle('trimStart', -1)).toBe('loopEnd');
    expect(TAKE_HANDLES).toHaveLength(4);
  });
});

describe('a drag lands in the right setting', () => {
  it('moves a trim handle through the trim window', () => {
    const moved = dragHandle(take(), 'trimStart', 3);
    expect(takeWindow(moved)).toEqual({ start: 3, end: 10, seconds: 7 });
  });

  it('moves a loop handle through the loop, not the window', () => {
    const started = dragHandle(take(), 'loopStart', 3);
    const ended = dragHandle(started, 'loopEnd', 5);
    expect(takeWindow(ended)).toEqual({ start: 0, end: 10, seconds: 10 });
    expect(ended.loopStart).toBe(3);
    expect(ended.loopEnd).toBe(5);
  });

  it('lets the model do the clamping and ordering', () => {
    const moved = dragHandle(take(), 'trimEnd', 99);
    expect(takeWindow(moved)).toEqual({ start: 0, end: 10, seconds: 10 });
    // Dragging the start handle past the end reads as the ordered pair, not backwards.
    const backwards = dragHandle(setTakeLoop(take(), 4, 6), 'loopStart', 9);
    expect(backwards.loopStart).toBe(6);
    expect(backwards.loopEnd).toBe(9);
  });
});

describe('the page’s small helpers', () => {
  it('measures the used fraction of a take', () => {
    expect(windowFraction(take())).toBe(1);
    expect(windowFraction(setTakeTrim(take(), 2, 6))).toBeCloseTo(0.4, 6);
  });

  it('draws one waveform column per two pixels, within reason', () => {
    expect(waveformColumns(200)).toBe(100);
    expect(waveformColumns(0)).toBe(1);
    expect(waveformColumns(1e6)).toBe(512);
  });
});

describe('the OUT half’s rows and writers', () => {
  it('labels the RENDER and LOUDNESS rows from the model’s own values', () => {
    // The label comes from the model (`bounceLabel`/`loudLabel`), the same the
    // file menu reads, so the two screens can never name a different region.
    expect(recorderRenderLabel('THE WHOLE SONG')).toBe('RENDER: THE WHOLE SONG');
    expect(recorderRenderLabel('BARS 8-15')).toBe('RENDER: BARS 8-15');
    expect(recorderLoudnessLabel('OFF')).toBe('LOUDNESS: OFF');
    expect(recorderLoudnessLabel('-14 STREAMING')).toBe('LOUDNESS: -14 STREAMING');
  });

  it('offers the same three writers the file menu does, in order, each with a blurb', () => {
    expect(RECORDER_EXPORTS.map((one) => one.id)).toEqual(['wav', 'stems', 'midi']);
    expect(RECORDER_EXPORTS.map((one) => one.label)).toEqual(['EXPORT WAV', 'STEMS ZIP', 'EXPORT MIDI']);
    expect(RECORDER_EXPORTS.every((one) => one.blurb.length > 0)).toBe(true);
  });

  it('tells the reader the keys the page actually binds', () => {
    expect(RECORDER_HINT).toContain('R RECORD');
    expect(RECORDER_HINT).toContain('DEL REMOVE');
    expect(RECORDER_HINT).toContain('ZOOM');
  });
});

describe('the waveform zooms about a centre', () => {
  it('fits the whole take at one step and halves the span from there', () => {
    expect(windowAt(10, 1, 5)).toEqual({ start: 0, span: 10 });
    expect(windowAt(10, 2, 5)).toEqual({ start: 2.5, span: 5 });
    expect(windowAt(10, 4, 5)).toEqual({ start: 3.75, span: 2.5 });
  });

  it('slides the window back inside the take rather than past its ends', () => {
    expect(windowAt(10, 4, 0)).toEqual({ start: 0, span: 2.5 });
    expect(windowAt(10, 4, 99)).toEqual({ start: 7.5, span: 2.5 });
  });

  it('answers an empty window for a take with no audio', () => {
    expect(windowAt(0, 4, 1)).toEqual({ start: 0, span: 0 });
  });

  it('clamps the zoom and steps it by doubling', () => {
    expect(clampZoom(0)).toBe(1);
    expect(clampZoom(2.4)).toBe(2);
    expect(clampZoom(999)).toBe(16);
    expect(zoomStep(1, 1)).toBe(2);
    expect(zoomStep(2, -1)).toBe(1);
    expect(zoomStep(1, -1)).toBe(1);
  });

  it('maps a time and a pixel through the zoomed window', () => {
    const win = { start: 2, span: 4 };
    expect(windowTimeToX(2, win, RECT)).toBe(100);
    expect(windowTimeToX(6, win, RECT)).toBe(300);
    expect(windowXToTime(200, RECT, win)).toBe(4);
    expect(windowXToTime(100, RECT, win)).toBe(2);
    // A time before the window clamps to its left edge, not off the plot.
    expect(windowTimeToX(0, win, RECT)).toBe(100);
  });
});

describe('a time field’s stepper moves one handle', () => {
  it('nudges a trim handle and lets the model clamp it', () => {
    const moved = stepTakeHandle(take(), 'trimStart', 0.25);
    expect(takeWindow(moved).start).toBeCloseTo(0.25, 6);
    // Past the end clamps to the whole take, exactly as a drag would.
    expect(takeWindow(stepTakeHandle(take(), 'trimEnd', 99)).end).toBe(10);
  });

  it('opens a loop from the whole window when a loop handle is nudged', () => {
    const looped = stepTakeHandle(take(), 'loopEnd', -2);
    expect(looped.loopStart).toBe(0);
    expect(looped.loopEnd).toBe(8);
  });

  it('does nothing for a zero or non-finite step', () => {
    const one = take();
    expect(stepTakeHandle(one, 'trimStart', 0)).toBe(one);
    expect(stepTakeHandle(one, 'trimStart', Number.NaN)).toBe(one);
  });
});

describe('a dropdown is a list that always fits on screen', () => {
  it('counts a row only when there is one', () => {
    expect(clampRow(3, 0)).toBe(-1);
    expect(clampRow(-5, 4)).toBe(0);
    expect(clampRow(9, 4)).toBe(3);
    expect(clampRow(Number.NaN, 4)).toBe(0);
  });

  it('moves and wraps, and answers -1 for an empty list', () => {
    const open = openDropdown(1, 4);
    expect(open).toEqual({ open: true, row: 1 });
    expect(moveDropdownRow(open, 4, 1).row).toBe(2);
    expect(moveDropdownRow(open, 4, -1).row).toBe(0);
    expect(moveDropdownRow({ open: true, row: 3 }, 4, 1).row).toBe(0);
    expect(moveDropdownRow(open, 0, 1).row).toBe(-1);
  });

  it('opens under its row, and above it when there is no room below', () => {
    const anchor = { x: 100, y: 60, width: 140, height: 20 };
    const below = dropdownRect(anchor, 3, 12, 341, 720);
    expect(below.y).toBe(80);
    expect(below.height).toBe(38);
    // No room below: it flips to sit above the anchor rather than off the page.
    const tall = { x: 100, y: 330, width: 140, height: 20 };
    const above = dropdownRect(tall, 3, 12, 341, 720);
    expect(above.y).toBe(292);
    expect(above.y + above.height).toBeLessThanOrEqual(341);
  });

  it('slides back inside the canvas rather than hanging off an edge', () => {
    const right = dropdownRect({ x: 700, y: 60, width: 140, height: 20 }, 2, 12, 341, 720);
    expect(right.x).toBe(580);
    expect(right.x + right.width).toBe(720);
  });

  it('maps a row to its rect inside the list', () => {
    const list = dropdownRect({ x: 0, y: 0, width: 100, height: 10 }, 3, 12, 341, 720);
    expect(dropdownRowRect(list, 1, 12)).toEqual({ x: list.x + 1, y: list.y + 13, width: 98, height: 12 });
    expect(dropdownRowRect(list, 2, 12)).toEqual({ x: list.x + 1, y: list.y + 25, width: 98, height: 12 });
  });
});

describe('the loudness dropdown is the model’s own ladder', () => {
  it('offers OFF and the four published stops, in order', () => {
    expect(loudnessRows().map((row) => row.value)).toEqual([null, -23, -16, -14, -9]);
    expect(loudnessRows()[0].label).toBe('OFF');
    expect(loudnessRows()[3].label).toContain('-14 LUFS');
  });

  it('finds the row a target is on, and -1 for a target of your own', () => {
    expect(loudnessRowIndex(null)).toBe(0);
    expect(loudnessRowIndex(-14)).toBe(3);
    expect(loudnessRowIndex(-12)).toBe(-1);
  });
});

describe('the input meter reads in decibels', () => {
  it('prints a level as dBFS, and silence as -INF', () => {
    expect(formatDbfs(0)).toBe('-INF dBFS');
    expect(formatDbfs(1)).toBe('+0 dBFS');
    // 0.126 is a touch over -18 dBFS.
    expect(formatDbfs(0.126)).toBe('-18 dBFS');
  });

  it('fills the bar logarithmically, from the floor to full scale', () => {
    expect(meterCells(0, 28)).toBe(0);
    expect(meterCells(1, 28)).toBe(28);
    const half = meterCells(Math.pow(10, METER_FLOOR_DB / 2 / 20), 28);
    expect(half).toBe(14);
  });

  it('names the floor and the ticks it prints', () => {
    expect(METER_FLOOR_DB).toBe(-48);
    expect([...METER_TICKS]).toEqual([-48, -24, -12, 0]);
  });

  it('calls only near-full-scale a CLIP', () => {
    expect(peakClips(0.5)).toBe(false);
    expect(peakClips(0.995)).toBe(true);
    expect(peakClips(Number.NaN)).toBe(false);
  });
});
