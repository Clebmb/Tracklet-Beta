import type Phaser from 'phaser';
import {
  activeColors,
  drawInset,
  intToCss,
  onThemeChanged,
  uiText,
  type Rect,
} from 'phaser-ui-canvas';
import { MAX_TRACK_NAME } from '../model/song';
import { RenameBox } from './RenameBox';

/**
 * PatternTitle — the pattern panel's heading: the CURRENT channel's name.
 *
 * The heading used to be the literal word `PATTERN`, which named the panel and
 * nothing else — you had to glance left at the track list to know WHICH channel
 * you were writing into. It now says the channel instead, because that is the
 * question the panel's own title should answer, and it is editable: shift-click
 * it and you are renaming the same channel the rows of the grid belong to, with
 * the same box (and the same one undo step) a shift-click on the track list row
 * uses. Two gestures, one edit, so "what is this channel called" has one answer
 * wherever a hand reaches for it.
 *
 * It is a component rather than a line in the scene for the reason the song's
 * own title in the header is: Phaser can draw a panel title but not make it a
 * control, so the text, its hit area and the DOM rename box have to be placed as
 * one thing. It reads the name through the scene — `setText` is pushed on every
 * change — so it can never show a name the song does not have.
 */

export interface PatternTitleHandlers {
  /** A name was committed and differs from the current one. */
  onRename?: (name: string) => void;
  /** The rename box opened or closed, so the scene can suspend its own input. */
  onEditingChange?: (editing: boolean) => void;
  /** The heading was clicked WITHOUT shift — the moment to teach the modifier. */
  onHint?: () => void;
}

export interface PatternTitleOptions {
  /** Left edge, in canvas coordinates. */
  x: number;
  /** Top edge, in canvas coordinates. */
  y: number;
  /** The widest the heading may grow before it is trimmed. */
  width: number;
  handlers?: PatternTitleHandlers;
}

/** The click target: the heading's box, a little taller than the 8px type. */
const ZONE_H = 13;
/** The ellipsis every other trimmed name in the app uses. */
const ELLIPSIS = '\u2026';
/** The narrowest a click target may be, so a short name is still reachable. */
const MIN_W = 60;

export class PatternTitle {
  private readonly opts: PatternTitleOptions;
  private readonly text: Phaser.GameObjects.Text;
  private readonly deco: Phaser.GameObjects.Graphics;
  private readonly hit: Phaser.GameObjects.Zone;
  private readonly box: RenameBox;
  private readonly unsubscribe: () => void;

  private value = '';
  private hovered = false;

  constructor(scene: Phaser.Scene, opts: PatternTitleOptions) {
    this.opts = opts;

    this.text = uiText(scene, opts.x, opts.y, '', { size: 8, color: activeColors().wordmark });
    this.deco = scene.add.graphics();
    this.hit = scene.add
      .zone(opts.x, opts.y - 2, MIN_W, ZONE_H)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // A plain click only teaches the modifier: renaming is rare, and shift-click
      // is the same deliberate gesture the track list and the grid already use.
      if ((p.event as MouseEvent | undefined)?.shiftKey === true) this.startRename();
      else this.opts.handlers?.onHint?.();
    });
    this.hit.on('pointerover', () => this.setHovered(true));
    this.hit.on('pointerout', () => this.setHovered(false));

    this.box = new RenameBox(scene, {
      rect: () => this.rect(),
      maxLength: MAX_TRACK_NAME,
      ariaLabel: 'Channel name',
      onCommit: (typed) => this.opts.handlers?.onRename?.(typed),
      onEditingChange: (open) => {
        this.text.setVisible(!open);
        this.place();
        this.opts.handlers?.onEditingChange?.(open);
      },
    });

    this.unsubscribe = onThemeChanged(() => this.recolor());
  }

  /** True while the name is being edited, so the scene knows to keep quiet. */
  get isRenaming(): boolean {
    return this.box.isOpen;
  }

  /** Commit an open rename immediately, before any other box opens. */
  commit(): void {
    this.box.commit();
  }

  setText(value: string): void {
    this.value = value;
    this.place();
  }

  destroy(): void {
    this.unsubscribe();
    this.box.destroy();
    this.text.destroy();
    this.deco.destroy();
    this.hit.destroy();
  }

  // --- geometry -------------------------------------------------------------

  /** The heading's own box, in canvas coordinates. While editing it takes the whole room. */
  private rect(): Rect {
    const width = Math.min(this.opts.width, Math.max(MIN_W, this.box.isOpen ? this.opts.width : this.text.width + 8));
    return { x: this.opts.x, y: this.opts.y - 2, width, height: ZONE_H };
  }

  private place(): void {
    this.text.setText(this.fitToRoom(this.value));
    const r = this.rect();
    this.hit.setPosition(r.x, r.y);
    this.hit.setSize(r.width, r.height);
    this.paint();
  }

  /** Shorten the name until it fits the panel, measuring each attempt. */
  private fitToRoom(text: string): string {
    if (this.text.setText(text).width <= this.opts.width) return text;
    for (let cut = text.length - 1; cut > 0; cut -= 1) {
      const next = text.slice(0, cut).trimEnd() + ELLIPSIS;
      if (this.text.setText(next).width <= this.opts.width) return next;
    }
    return ELLIPSIS;
  }

  // --- feedback -------------------------------------------------------------

  private setHovered(on: boolean): void {
    this.hovered = on;
    this.paint();
  }

  private paint(): void {
    const g = this.deco;
    const r = this.rect();
    g.clear();
    if (this.box.isOpen) {
      drawInset(g, r, 1, activeColors());
      return;
    }
    if (!this.hovered) return;
    g.fillStyle(activeColors().ward, 0.9);
    g.fillRect(r.x, this.opts.y + 10, r.width, 1);
  }

  private recolor(): void {
    this.text.setColor(intToCss(activeColors().wordmark));
    this.box.recolor(activeColors());
    this.paint();
  }

  // --- renaming -------------------------------------------------------------

  /** Open the box on the current name. Only ever called from the shift-click zone. */
  private startRename(): void {
    this.box.recolor(activeColors());
    this.box.start(this.value);
    this.place();
  }
}
