import type Phaser from 'phaser';
import { intToCss } from 'phaser-ui-canvas';

import { activeTextScaleFactor } from './textScale';

/**
 * RenameBox — one DOM `<input>` floated over a rectangle of the canvas.
 *
 * Two things in the app are renamed by typing: a channel (from its row) and the
 * song (from the header). Both need the same four behaviours — a real text box,
 * mapped onto the canvas's own scaling, that commits on Enter or a click away
 * and reverts on Escape — so both use this, and the second one cannot drift from
 * the first.
 *
 * ── Why a DOM input at all ────────────────────────────────────────────────────
 * Phaser can draw text but cannot edit it, so an in-canvas editor would be a
 * text editor written from scratch that still could not select, paste, or handle
 * an IME. A real `<input>` gets all of that, and gets the operating system's
 * carets and keyboard for free. It is positioned from the canvas's bounding
 * rect, so it tracks the game's FIT scaling and stays on its target through a
 * window resize.
 *
 * ── What it deliberately does NOT know ───────────────────────────────────────
 * The model. It hands back the text you typed; the caller decides that an empty
 * name is a cancel, or that a name is upper-cased and trimmed, or that nothing
 * changed and no undo step is warranted. That is why it is usable for two very
 * different things.
 */

/** The canvas the app is drawn in; the overlay is mapped from this. */
const CANVAS_W = 720;
const CANVAS_H = 405;

export interface RenameBoxOptions {
  /** Where the box should sit, in canvas coordinates, or null if it has no target yet. */
  rect: () => { x: number; y: number; width: number; height: number } | null;
  /** Committed text, exactly as typed (callers tidy it). Never called for a no-op. */
  onCommit: (value: string) => void;
  /** The box opened or closed, so the scene can suspend its own keyboard handling. */
  onEditingChange?: (editing: boolean) => void;
  maxLength: number;
  /** What a screen reader announces, e.g. "Channel name". */
  ariaLabel: string;
  /** Upper-case as it is typed, so what is committed is what was seen. */
  uppercase?: boolean;
  /** Font size in CANVAS pixels; scaled with everything else. */
  fontSize?: number;
}

export class RenameBox {
  private readonly scene: Phaser.Scene;
  private readonly opts: RenameBoxOptions;
  private readonly input: HTMLInputElement;
  private open = false;
  private readonly onResize = (): void => this.place();

  constructor(scene: Phaser.Scene, opts: RenameBoxOptions) {
    this.scene = scene;
    this.opts = opts;
    this.input = this.build();
  }

  /** True while a name is being edited, so the scene knows to keep quiet. */
  get isOpen(): boolean {
    return this.open;
  }

  /** Open the box on a current value, with it selected so typing replaces it. */
  start(value: string): void {
    if (this.open) this.finish(false);
    this.open = true;
    this.input.value = value;
    this.input.style.textTransform = this.opts.uppercase === false ? 'none' : 'uppercase';
    this.input.style.display = 'block';
    this.place();
    this.input.focus();
    this.input.select();
    window.addEventListener('resize', this.onResize);
    this.scene.scale.on('resize', this.onResize);
    this.opts.onEditingChange?.(true);
  }

  /**
   * Commit an open box immediately. The scene calls this before opening any other
   * text box, so two of them can never be fighting over the keyboard.
   */
  commit(): void {
    this.finish(false);
  }

  /** Close the box. `cancel` throws the typed text away. */
  finish(cancel: boolean): void {
    if (!this.open) return;
    this.open = false;
    const typed = this.input.value.trim();
    this.input.style.display = 'none';
    this.input.blur();
    window.removeEventListener('resize', this.onResize);
    this.scene.scale.off('resize', this.onResize);

    if (!cancel && typed !== '') this.opts.onCommit(typed);
    this.opts.onEditingChange?.(false);
  }

  destroy(): void {
    // Close BEFORE the input goes away, so its blur handler cannot run against a
    // scene that is already tearing down.
    this.open = false;
    window.removeEventListener('resize', this.onResize);
    this.scene.scale.off('resize', this.onResize);
    this.input.remove();
  }

  // --- plumbing -------------------------------------------------------------

  private build(): HTMLInputElement {
    const el = document.createElement('input');
    el.type = 'text';
    el.spellcheck = false;
    el.autocapitalize = 'off';
    el.autocomplete = 'off';
    el.maxLength = this.opts.maxLength;
    el.setAttribute('aria-label', this.opts.ariaLabel);
    Object.assign(el.style, {
      position: 'fixed',
      display: 'none',
      zIndex: '50',
      boxSizing: 'border-box',
      margin: '0',
      borderStyle: 'solid',
      borderWidth: '1px',
      borderRadius: '0',
      outline: 'none',
      textAlign: 'center',
      fontFamily: "'Silkscreen', monospace",
      opacity: '0.98',
    } satisfies Partial<CSSStyleDeclaration>);
    el.addEventListener('keydown', (event: KeyboardEvent) => {
      // Escape reverts and Enter commits, which is what both hands expect. The
      // scene has its own listeners suspended while this box is open, so these
      // cannot also mean "stop playback" or "write a note".
      if (event.key === 'Escape') {
        event.preventDefault();
        this.finish(true);
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        this.finish(false);
      }
    });
    // A click anywhere else commits, the way every other rename box behaves.
    el.addEventListener('blur', () => this.finish(false));
    document.body.appendChild(el);
    return el;
  }

  /** Sit the box exactly over its target rect, through the canvas's scaling. */
  private place(): void {
    const box = this.opts.rect();
    if (!box) return;
    const r = this.scene.game.canvas.getBoundingClientRect();
    const sx = r.width / CANVAS_W;
    const sy = r.height / CANVAS_H;
    const s = this.input.style;
    s.left = `${Math.round(r.left + box.x * sx)}px`;
    s.top = `${Math.round(r.top + box.y * sy)}px`;
    s.width = `${Math.round(box.width * sx)}px`;
    s.height = `${Math.round(box.height * sy)}px`;
    // The same bargain the script box makes: the window sets the baseline and
    // the TEXT SIZE setting multiplies it.
    s.fontSize = `${Math.max(9, Math.round((this.opts.fontSize ?? 9) * sy * activeTextScaleFactor()))}px`;
    s.padding = `0 ${Math.max(1, Math.round(2 * sx))}px`;
  }

  /**
   * Recolour the box to the active theme. Called by `place`, so a box opened
   * after a theme switch is right, and by the owner's own theme listener for the
   * rarer case of switching a theme with the box already up.
   */
  recolor(colors: { ink: number; textPrimary: number; ward: number }): void {
    const s = this.input.style;
    s.backgroundColor = intToCss(colors.ink);
    s.color = intToCss(colors.textPrimary);
    s.borderColor = intToCss(colors.ward);
    s.caretColor = intToCss(colors.ward);
  }
}

