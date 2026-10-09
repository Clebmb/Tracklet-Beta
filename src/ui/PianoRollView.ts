import type Phaser from 'phaser';
import { activeColors, activeTheme, intToCss, onThemeChanged, uiText, type Rect } from 'phaser-ui-canvas';

import { cellNotes, midiToNoteName, type Pattern, type SongKey } from '../model';
import {
  ROLL_GUTTER,
  pitchAtY,
  pitchInKey,
  rollLayout,
  stepAtX,
  xForStep,
  yForPitch,
  type RollLayout,
} from './pianoRoll';
import { trackColor } from './trackColor';

/**
 * PianoRoll — the pattern read as a piano roll, one channel at a time.
 *
 * The note grid is the tracker's reading: rows are time and a cell spells its
 * pitch. That is compact and fast for someone who knows it, and close to opaque
 * for someone who has met music on a keyboard. So `F8` cycles the pattern panel
 * through its readings, and this is the one where pitch is HEIGHT.
 *
 * ── The four decisions ───────────────────────────────────────────────────────
 *   • ONE CHANNEL, the cursor's. A piano roll of eight channels at once is eight
 *     graphs stacked, which is not a reading of anything. The title says which.
 *   • THE CHANNEL'S OWN RANGE. The rows are the pitches that channel actually
 *     plays, grown to at least an octave and trimmed to three, so a bass part is
 *     not six pixels in the middle of an empty keyboard.
 *   • IT SCROLLS SIDEWAYS, like the grid scrolls down: columns stop shrinking at
 *     a legible width and the window follows the cursor.
 *   • IT IS A VIEW, NEVER AN EDIT OF ITS OWN. A click writes a note through the
 *     scene's own editor (one undo step, exactly as typing one is); the roll
 *     itself takes no step and is not saved anywhere.
 *
 * Everything geometric is `pianoRoll.ts`, which is pure and tested; this file is
 * the pixels.
 */

export interface PianoRollHandlers {
  /** A note was clicked: write it at that step and pitch on the cursor's channel. */
  onPick?: (step: number, midi: number) => void;
  /** A note was right-clicked: take it out, if the step holds that pitch. */
  onSecondaryPick?: (step: number, midi: number) => void;
}

/** Semitones that are black keys on a keyboard, so a row can be shaded dark. */
const BLACK_KEY = new Set([1, 3, 6, 8, 10]);

export class PianoRoll {
  readonly container: Phaser.GameObjects.Container;

  private readonly rect: Rect;
  private readonly handlers: PianoRollHandlers;

  private readonly bgGfx: Phaser.GameObjects.Graphics;
  private readonly noteGfx: Phaser.GameObjects.Graphics;
  private readonly frameGfx: Phaser.GameObjects.Graphics;
  private readonly labelPool: Phaser.GameObjects.Text[] = [];
  private readonly zone: Phaser.GameObjects.Zone;

  private pattern: Pattern;
  private key: SongKey;
  private cursor = { row: 0, track: 0 };
  private playhead = -1;
  private layout: RollLayout;
  private visible = false;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, rect: Rect, pattern: Pattern, key: SongKey, handlers: PianoRollHandlers = {}) {
    this.rect = rect;
    this.pattern = pattern;
    this.key = key;
    this.handlers = handlers;
    this.layout = rollLayout(pattern, 0, 0, rect.width, rect.height);

    this.container = scene.add.container(rect.x, rect.y).setVisible(false);
    this.bgGfx = scene.add.graphics();
    this.frameGfx = scene.add.graphics();
    this.noteGfx = scene.add.graphics();
    this.container.add([this.bgGfx, this.noteGfx, this.frameGfx]);

    // One zone over the roll's BODY (the keyboard strip is a label, not a
    // target), mapped to a step and a pitch by arithmetic like the grid's.
    this.zone = scene.add.zone(ROLL_GUTTER, 0, Math.max(1, rect.width - ROLL_GUTTER), Math.max(1, rect.height))
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const hit = this.hit(p.x - this.rect.x, p.y - this.rect.y);
      if (!hit) return;
      const secondary = p.rightButtonDown() || (p.event as MouseEvent | undefined)?.shiftKey === true;
      if (secondary) this.handlers.onSecondaryPick?.(hit.step, hit.pitch);
      else this.handlers.onPick?.(hit.step, hit.pitch);
    });
    this.container.add(this.zone);

    // The gutter labels are pooled: one per row the widest roll can show, so a
    // scroll recolours text rather than creating it.
    for (let i = 0; i < 36; i += 1) {
      const obj = uiText(scene, 2, 0, '', { size: 8, color: activeColors().textDim });
      this.container.add(obj);
      this.labelPool.push(obj);
    }

    this.unsubscribe = onThemeChanged(() => this.render());
    this.render();
  }

  get isVisible(): boolean { return this.visible; }

  setVisible(on: boolean): void {
    this.visible = on;
    this.container.setVisible(on);
    if (on) this.render();
  }

  setPattern(pattern: Pattern): void {
    this.pattern = pattern;
    if (this.visible) this.render();
  }

  setKey(key: SongKey): void {
    this.key = key;
    if (this.visible) this.render();
  }

  setCursor(row: number, track: number): void {
    const changedTrack = track !== this.cursor.track;
    this.cursor = { row, track };
    // A different channel is a different roll — new range, new rows — so anything
    // but a sideways move redraws the whole thing.
    if (this.visible && (changedTrack || row !== this.cursor.row)) this.render();
  }

  setPlayhead(row: number): void {
    if (row === this.playhead) return;
    this.playhead = row;
    if (this.visible) this.render();
  }

  /** Redraw after an edit — the pattern is the object the editor mutated. */
  refresh(): void {
    if (this.visible) this.render();
  }

  /** The step and pitch under a body-local point, or null. */
  hit(x: number, y: number): { step: number; pitch: number } | null {
    const step = stepAtX(x, this.layout);
    if (step === null || step >= this.pattern.steps.length) return null;
    if (y < 0 || y >= this.rect.height) return null;
    return { step, pitch: pitchAtY(y, this.layout) };
  }

  render(): void {
    const c = activeColors();
    const theme = activeTheme();
    const layout = rollLayout(this.pattern, this.cursor.track, this.cursor.row, this.rect.width, this.rect.height);
    this.layout = layout;

    const bg = this.bgGfx;
    const note = this.noteGfx;
    const frame = this.frameGfx;
    bg.clear();
    note.clear();
    frame.clear();

    const topPitch = layout.low + layout.span - 1;
    const noteColor = trackColor(this.cursor.track, c);

    // The rows, bottom to top: a dark fill, a lighter one for the black keys, and
    // a faint wash over the ones the song's key uses — so the roll shows the same
    // "these notes are the home ones" the piano does.
    for (let pitch = layout.low; pitch <= topPitch; pitch += 1) {
      const y = yForPitch(pitch, layout);
      const h = Math.ceil(layout.rowH);
      const black = BLACK_KEY.has(pitch % 12);
      bg.fillStyle(c.ink, black ? 0.95 : 0.7);
      bg.fillRect(0, y, layout.width, h);
      if (this.inKey(pitch)) {
        bg.fillStyle(c.ooze, 0.07);
        bg.fillRect(ROLL_GUTTER, y, layout.width - ROLL_GUTTER, h);
      }
      if (pitch % 12 === 0) {
        bg.fillStyle(c.stone, 0.5);
        bg.fillRect(ROLL_GUTTER, y + h - 1, layout.width - ROLL_GUTTER, 1);
      }
    }

    // The beat lines, so a bar is countable without the gutter.
    const rowsPerBeat = Math.max(1, 4);
    for (let step = layout.firstStep; step < layout.firstStep + layout.columns; step += 1) {
      if (step % (rowsPerBeat * 4) !== 0) continue;
      const x = xForStep(step, layout);
      frame.fillStyle(c.stone, 0.5);
      frame.fillRect(x, 0, 1, layout.height);
    }

    // The notes this channel holds in the window.
    const last = Math.min(this.pattern.steps.length, layout.firstStep + layout.columns);
    for (let step = layout.firstStep; step < last; step += 1) {
      const cell = this.pattern.steps[step]?.[this.cursor.track];
      if (!cell) continue;
      const x = xForStep(step, layout);
      const w = Math.max(2, layout.stepW - 1);
      for (const midi of cellNotes(cell)) {
        if (midi < layout.low || midi > topPitch) continue;
        const y = yForPitch(midi, layout);
        note.fillStyle(noteColor, cell.note === midi ? 0.9 : 0.65);
        note.fillRect(x + 1, y + 1, w, Math.max(2, Math.ceil(layout.rowH) - 2));
      }
    }

    // The cursor's step, and the playhead's, as columns.
    if (this.playhead >= 0 && this.playhead >= layout.firstStep && this.playhead < last) {
      const x = xForStep(this.playhead, layout);
      frame.fillStyle(c.ward, 0.18);
      frame.fillRect(x, 0, layout.stepW, layout.height);
    }
    if (this.cursor.row >= layout.firstStep && this.cursor.row < last) {
      const x = xForStep(this.cursor.row, layout);
      frame.fillStyle(c.ooze, 0.22);
      frame.fillRect(x, 0, layout.stepW, layout.height);
      frame.fillStyle(c.ooze, 0.9);
      frame.fillRect(x, 0, 2, layout.height);
    }

    // The keyboard down the left edge: label every C, and tint the key rows.
    frame.fillStyle(c.ink, 0.9);
    frame.fillRect(0, 0, ROLL_GUTTER, layout.height);
    for (let pitch = layout.low; pitch <= topPitch; pitch += 1) {
      const y = yForPitch(pitch, layout);
      const h = Math.ceil(layout.rowH);
      if (pitch % 12 === 0) {
        frame.fillStyle(c.stone, 0.8);
        frame.fillRect(ROLL_GUTTER - 3, y + h - 1, 3, 1);
      }
    }
    frame.fillStyle(theme.colors.ooze, 0.6);
    frame.fillRect(ROLL_GUTTER - 1, 0, 1, layout.height);

    this.labelPool.forEach((obj, i) => {
      const pitch = topPitch - i;
      if (pitch < layout.low || layout.rowH < 6) { obj.setVisible(false); return; }
      const name = pitch % 12 === 0 ? midiToNoteName(pitch) : '';
      obj.setVisible(name !== '');
      if (name !== '') {
        obj.setY(yForPitch(pitch, layout));
        obj.setText(name);
        obj.setColor(intToCss(this.inKey(pitch) ? theme.colors.ooze : c.textDim));
      }
    });

    this.container.setVisible(this.visible);
  }

  private inKey(pitch: number): boolean {
    // The scale's own membership, straight from the model — the same test the
    // piano uses to dim the notes outside the key, so the two cannot disagree.
    return pitchInKey(pitch, this.key);
  }

  destroy(): void {
    this.unsubscribe();
    for (const obj of this.labelPool) obj.destroy();
    this.bgGfx.destroy();
    this.noteGfx.destroy();
    this.frameGfx.destroy();
    this.zone.destroy();
    this.container.destroy();
  }
}
