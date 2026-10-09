import type Phaser from 'phaser';
import {
  activeColors,
  intToCss,
  onThemeChanged,
  uiText,
  type Rect,
} from 'phaser-ui-canvas';
import { MAX_SONG_TITLE, tidySongTitle } from '../model/song';
import { RenameBox } from './RenameBox';

/**
 * HeaderLine — the top bar's song title and right-hand readout: the
 * pattern, length, channel count and note count.
 *
 * It is a component rather than four lines in the scene because the title is
 * EDITABLE: shift-clicking it opens a rename box, exactly the way shift-clicking
 * a channel's name does in the track list. Both use the same `RenameBox`, and
 * both hand the result to a scene method that records one undo step, so a title
 * typed in the header and a title written by `song "..."` in a script are the
 * same edit to the same field.
 *
 * ── Why the title is its own Text ─────────────────────────────────────────────
 * It used to be part of one long string with the readout, which meant the only
 * thing you could hit was the whole line. Split in two, the title has a width of
 * its own — so the click target is the title and nothing else, and shift-clicking
 * the word STEPS cannot rename your song.
 *
 * ── Why it shrinks rather than growing ────────────────────────────────────────
 * The title starts beside the wordmark, in the former tagline's space, while
 * the readout stays right-aligned. A long title is trimmed to the room it has,
 * measured from the live text rather than guessed at, with the same ellipsis the
 * channel rows use. The model keeps the whole title; only the screen shortens it.
 */

export interface HeaderLineHandlers {
  /** A title was committed (already trimmed and upper-cased) and differs from the current one. */
  onRename?: (title: string) => void;
  /** The rename box opened or closed, so the scene can suspend its own input. */
  onEditingChange?: (editing: boolean) => void;
  /** The title was clicked WITHOUT shift, which is the moment to teach the modifier. */
  onHint?: () => void;
}

export interface HeaderLineOptions {
  /** Where the readout ends, in canvas coordinates. */
  right: number;
  /** The line's top, in canvas coordinates. */
  y: number;
  /** The title's left edge, just after the wordmark. */
  minX: number;
  handlers?: HeaderLineHandlers;
}

/** Air between the title and the readout. */
const GAP = 10;
/** The click target: the title's box, a little taller than the 8px type. */
const ZONE_H = 13;
/** The ellipsis the channel rows use, so a shortened name looks the same anywhere. */
const ELLIPSIS = '\u2026';

export class HeaderLine {
  readonly container: Phaser.GameObjects.Container;

  private readonly opts: HeaderLineOptions;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly metaText: Phaser.GameObjects.Text;
  private readonly hit: Phaser.GameObjects.Zone;
  /** The hover underline, or the well the rename box sits in. */
  private readonly deco: Phaser.GameObjects.Graphics;
  private readonly box: RenameBox;
  private readonly unsubscribe: () => void;

  private title = '';
  private titleRight = 0;
  private hovered = false;

  constructor(scene: Phaser.Scene, opts: HeaderLineOptions) {
    this.opts = opts;

    // The title has a stable left edge; the readout keeps its right anchor.
    const style = { size: 8, color: activeColors().textPrimary, origin: { x: 1, y: 0 } } as const;
    this.metaText = uiText(scene, opts.right, opts.y, '', style);
    this.titleText = uiText(scene, opts.minX, opts.y, '', { ...style, origin: { x: 0, y: 0 } });
    this.deco = scene.add.graphics();
    this.hit = scene.add
      .zone(opts.right, opts.y, 10, ZONE_H)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // A plain click only teaches the modifier: renaming the song is rare, and
      // shift-click is the same deliberate gesture the grid and the channel rows
      // already use for their edits.
      if ((p.event as MouseEvent | undefined)?.shiftKey === true) this.startRename();
      else this.opts.handlers?.onHint?.();
    });
    this.hit.on('pointerover', () => this.setHovered(true));
    this.hit.on('pointerout', () => this.setHovered(false));

    this.container = scene.add.container(0, 0, [this.metaText, this.titleText, this.deco, this.hit]);

    this.box = new RenameBox(scene, {
      rect: () => this.titleRect(),
      maxLength: MAX_SONG_TITLE,
      ariaLabel: 'Song title',
      onCommit: (typed) => {
        const clean = tidySongTitle(typed);
        if (clean !== '' && clean !== this.title) this.opts.handlers?.onRename?.(clean);
      },
      onEditingChange: (open) => {
        this.setEditing(open);
        this.opts.handlers?.onEditingChange?.(open);
      },
    });

    this.unsubscribe = onThemeChanged(() => this.recolor());
  }

  /** True while the title is being edited, so the scene knows to keep quiet. */
  get isRenaming(): boolean {
    return this.box.isOpen;
  }

  /** Commit an open rename immediately, before any other box opens. */
  commit(): void {
    this.box.commit();
  }

  setTitle(title: string): void {
    this.title = title;
    this.place();
  }

  /** The right-aligned readout, e.g. `PAT 1  ·  16 STEPS`. */
  setMeta(text: string): void {
    this.metaText.setText(text);
    this.place();
  }

  destroy(): void {
    this.unsubscribe();
    this.box.destroy();
    this.container.destroy();
  }

  // --- geometry -------------------------------------------------------------

  /**
   * The title's own box, in canvas coordinates — both the click target and the
   * DOM overlay's target. While the box is open it takes the WHOLE room the
   * title may use, so a title too long to display is still fully visible in the
   * one place you can edit it.
   */
  private titleRect(): Rect {
    const available = Math.max(0, this.titleRight - this.opts.minX);
    const width = this.isRenaming ? available : Math.min(available, Math.max(40, this.titleText.width));
    return { x: this.opts.minX, y: this.opts.y - 2, width, height: ZONE_H };
  }

  /**
   * Keep both anchors stable and trim the title before it reaches the readout.
   */
  private place(): void {
    const metaLeft = this.opts.right - this.metaText.width;
    this.titleRight = Math.round(metaLeft - GAP);
    this.titleText.setX(this.opts.minX);
    this.titleText.setText(this.fitToRoom(this.title));
    const rect = this.titleRect();
    this.hit.setPosition(rect.x, rect.y);
    this.hit.setSize(rect.width, rect.height);
    this.paint();
  }

  /**
   * Shorten a title until it fits the room it has, measuring each attempt. The
   * channel rows clip with a characters-per-pixel estimate; measuring is exact
   * for any face and this runs only when the title or the readout changes.
   */
  private fitToRoom(text: string): string {
    const budget = this.titleRight - this.opts.minX;
    if (budget <= 0) return '';
    if (this.titleText.setText(text).width <= budget) return text;
    for (let cut = text.length - 1; cut > 0; cut -= 1) {
      const next = text.slice(0, cut).trimEnd() + ELLIPSIS;
      if (this.titleText.setText(next).width <= budget) return next;
    }
    return ELLIPSIS;
  }

  // --- feedback -------------------------------------------------------------

  private setHovered(on: boolean): void {
    this.hovered = on;
    this.paint();
  }

  private setEditing(on: boolean): void {
    // The DOM box covers this text, so it is hidden rather than drawn under it.
    this.titleText.setVisible(!on);
    // `isRenaming` already reads true here, so this re-places the box and the
    // well onto the wider "editing" rect the field needs.
    this.place();
  }

  /** The underline under a hovered title, or the well under an open box. */
  private paint(): void {
    const g = this.deco;
    const rect = this.titleRect();
    g.clear();
    if (this.isRenaming) {
      const c = activeColors();
      g.fillStyle(c.ink, 1);
      g.fillRect(rect.x, rect.y, rect.width, rect.height);
      g.lineStyle(1, c.ward, 1);
      g.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
      return;
    }
    if (!this.hovered) return;
    g.fillStyle(activeColors().ward, 0.9);
    g.fillRect(rect.x, this.opts.y + 10, rect.width, 1);
  }

  private recolor(): void {
    const css = intToCss(activeColors().textPrimary);
    this.titleText.setColor(css);
    this.metaText.setColor(css);
    this.box.recolor(activeColors());
    this.paint();
  }

  // --- renaming -------------------------------------------------------------

  /** Open the box on the title. Only ever called from the shift-click zone. */
  private startRename(): void {
    this.box.recolor(activeColors());
    this.box.start(this.title);
  }
}
