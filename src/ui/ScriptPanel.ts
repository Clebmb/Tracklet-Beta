import type Phaser from 'phaser';
import {
  activeColors,
  activeTheme,
  Button,
  drawDivider,
  drawInset,
  drawPanel,
  intToCss,
  onThemeChanged,
  uiText,
  type Rect,
} from 'phaser-ui-canvas';

import {
  parseScript,
  SCRIPT_DOC_PATH,
  SCRIPT_EXAMPLE,
  SCRIPT_QUICK_REFERENCE,
  SCRIPT_RULE_OF_THUMB,
  type ScriptContext,
  type ScriptDiagnostic,
} from '../model/script';
import { activeTextScaleFactor } from './textScale';

/**
 * ScriptPanel — the SCRIPT modal: a place to paste a Tracklet Script, see what
 * it is going to do BEFORE it does it, and apply it or walk away.
 *
 * Two decisions shape this file, and both are about who the author is.
 *
 * 1. THE PASTE BOX IS A REAL DOM `<textarea>`, floated over the canvas.
 *
 *    Phaser can draw text but cannot edit it, and it cannot see the clipboard.
 *    A script arrives pasted, multi-line, usually from somewhere else, so a box
 *    built out of canvas `keydown` handling would be a text editor written from
 *    scratch that still could not paste. One absolutely-positioned `<textarea>`
 *    gets selection, undo, IME and Ctrl+V for free. It is positioned from the
 *    canvas's own bounding rect, so it tracks the game's FIT scaling exactly,
 *    and `place()` is re-run on every resize. Everything else in the modal —
 *    the frame, the reference, the live check, the buttons — is drawn in canvas
 *    so it matches the rest of the app.
 *
 * 2. NOTHING IS APPLIED UNTIL IT PARSES CLEAN.
 *
 *    The panel re-parses on every keystroke (throttled) and renders either the
 *    errors, each with its line number, or a summary of what the script would
 *    produce. APPLY is therefore never a gamble: by the time it is enabled, the
 *    song is already known. That is the same contract the model's `applyScript`
 *    offers — atomic, parse-before-apply — surfaced where a person, or an agent
 *    watching the screen, can act on it.
 *
 * The scene owns the song; the panel owns only the text and its verdict. APPLY
 * reports back through `onApply`, and the scene either closes the panel or
 * calls `showErrors` with whatever the authoritative apply said.
 */

export interface ScriptPanelHandlers {
  /** APPLY was pressed. The scene applies, then closes or calls `showErrors`. */
  onApply?: (source: string) => void;
  /** The panel opened or closed, so the scene can suspend its own input. */
  onOpenChange?: (open: boolean) => void;
  /**
   * The MCP button was pressed: the scene closes this box and opens the MCP page.
   *
   * It is a callback rather than something this panel could do itself because the
   * MCP page is a modal in exactly the way this one is — one owns the input at a
   * time, and the scene is the only thing that knows which.
   */
  onMcp?: () => void;
}

/** What the parser needs to know about the song being edited. */
/**
 * The parse context the box checks against — the model's own, aliased rather
 * than copied.
 *
 * It was a hand-written twin of `ScriptContext`, which is exactly how the two
 * drift: a field added to the language's context (the saved voices, say) would
 * be silently missing from the live check, and the box would refuse a line the
 * APPLY button would have accepted. One type, one truth.
 */
export type ScriptPanelContext = ScriptContext;

/** The canvas the app is drawn in; the DOM overlay is mapped from this. */
const CANVAS_W = 720;
const CANVAS_H = 405;

/** The modal frame and the paste area, in canvas coordinates. */
const MODAL: Rect = { x: 44, y: 14, width: 632, height: 377 };
const BOX: Rect = { x: 220, y: 46, width: 452, height: 198 };

/** Render depths: dim layer < click curtain < frame < text and buttons. */
const DEPTH_DIM = 880;
const DEPTH_CURTAIN = 882;
const DEPTH_FRAME = 890;
const DEPTH_FRONT = 900;

/** How many diagnostics or status lines the verdict area shows at once. */
const MAX_STATUS_LINES = 7;

/** Which theme colour a piece of static copy wears, so a recolour can find it. */
type TextRole = 'heading' | 'body' | 'accent' | 'dim';

interface StaticText {
  obj: Phaser.GameObjects.Text;
  role: TextRole;
}

interface StatusLine {
  text: string;
  color: number;
}

export class ScriptPanel {
  private readonly scene: Phaser.Scene;
  private readonly handlers: ScriptPanelHandlers;

  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly textarea: HTMLTextAreaElement;
  private readonly applyButton: Button;
  private readonly cancelButton: Button;
  private readonly exampleButton: Button;
  private readonly mcpButton: Button;

  private readonly staticTexts: StaticText[] = [];
  private statusTexts: Phaser.GameObjects.Text[] = [];

  private context: ScriptPanelContext;
  private opened = false;
  private overrideErrors: ScriptDiagnostic[] | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribe: () => void;
  private readonly onResize = (): void => this.place();

  constructor(
    scene: Phaser.Scene,
    handlers: ScriptPanelHandlers,
    context: ScriptPanelContext,
  ) {
    this.scene = scene;
    this.handlers = handlers;
    this.context = context;

    const body = panelBody(MODAL);
    const right = BOX.x;
    const rightW = body.x + body.width - right;
    const btnY = MODAL.y + MODAL.height - 26;

    // --- canvas chrome -------------------------------------------------------
    this.dim = scene.add.graphics().setDepth(DEPTH_DIM);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);

    // A full-screen zone that swallows clicks meant for the app behind the
    // modal. Without it the grid, piano and transport zones would still be live
    // under the dim layer, and a stray click would edit the song.
    this.curtain = scene.add.zone(0, 0, CANVAS_W, CANVAS_H).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);

    this.addStatic(MODAL.x + 4, MODAL.y + 2, 'SCRIPT  -  WRITE MUSIC AS TEXT', 'accent');
    this.addStatic(right, 34, 'PASTE YOUR SCRIPT  -  OR PRESS LOAD EXAMPLE', 'dim');
    this.addStatic(body.x, 34, 'HOW IT READS', 'dim');

    // The left column: the cheat sheet, so the language is never more than a
    // glance away while writing it.
    let y = 46;
    for (const line of SCRIPT_QUICK_REFERENCE) {
      this.addStatic(body.x, y, line, 'body');
      y += 11;
    }
    this.addStatic(body.x, y + 8, 'REMEMBER', 'dim');
    const rule = uiText(this.scene, body.x, y + 20, SCRIPT_RULE_OF_THUMB, {
      size: 8, color: activeColors().textDim, wordWrapWidth: 158,
    });
    rule.setDepth(DEPTH_FRONT);
    this.staticTexts.push({ obj: rule, role: 'dim' });
    this.addStatic(body.x, y + 52, 'FULL GUIDE', 'dim');
    this.addStatic(body.x, y + 64, SCRIPT_DOC_PATH, 'accent');
    this.addStatic(body.x, y + 84, 'THE DOC/ FOLDER', 'dim');
    this.addStatic(body.x, y + 94, 'EXPLAINS EVERY WORD.', 'dim');

    // --- buttons -------------------------------------------------------------
    // Four across, and MCP is first because it is the one that LEAVES this box
    // rather than acting on it: the box is where a script lands, and an agent's
    // script has to come from somewhere, so the way to ask one sits beside the
    // way to paste.
    this.mcpButton = new Button(scene, { x: right, y: btnY, width: 62, height: 20 }, 'MCP', { size: 8 });
    this.mcpButton.container.setDepth(DEPTH_FRONT);
    this.mcpButton.onPress = () => this.handlers.onMcp?.();
    this.exampleButton = new Button(scene, { x: right + 70, y: btnY, width: rightW - 288, height: 20 }, 'LOAD EXAMPLE', { size: 8 });
    this.exampleButton.container.setDepth(DEPTH_FRONT);
    this.exampleButton.onPress = () => this.loadExample();
    this.cancelButton = new Button(scene, { x: right + rightW - 210, y: btnY, width: 96, height: 20 }, 'CANCEL', { size: 8 });
    this.cancelButton.container.setDepth(DEPTH_FRONT);
    this.cancelButton.onPress = () => this.close();
    this.applyButton = new Button(scene, { x: right + rightW - 106, y: btnY, width: 106, height: 20 }, 'APPLY', { size: 8, icon: 'chevron-right' });
    this.applyButton.container.setDepth(DEPTH_FRONT);
    this.applyButton.onPress = () => this.apply();

    // --- the paste box -------------------------------------------------------
    this.textarea = this.makeTextarea();
    this.place();

    this.unsubscribe = onThemeChanged(() => this.renderChrome());
    this.setOpen(false);
    this.renderChrome();
  }

  /** True while the modal is up; the scene uses it to suspend its own input. */
  get isOpen(): boolean {
    return this.opened;
  }

  /** The text currently in the paste box. */
  get source(): string {
    return this.textarea.value;
  }

  /** Refresh the parse context: the song may have changed shape while closed. */
  setContext(context: ScriptPanelContext): void {
    this.context = context;
    if (this.opened) this.refresh();
  }

  /** Show the modal, optionally priming the paste box with `source`. */
  open(source?: string): void {
    if (this.opened) return;
    if (source !== undefined) this.textarea.value = source;
    this.overrideErrors = null;
    this.setOpen(true);
    this.place();
    this.refresh();
    this.textarea.focus();
    // Caret to the end, so an author (or an agent) that just pasted can type on.
    this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
  }

  close(): void {
    if (!this.opened) return;
    this.setOpen(false);
  }

  /** An authoritative apply failed: pin these errors in the verdict area. */
  showErrors(errors: ScriptDiagnostic[]): void {
    this.overrideErrors = errors;
    this.renderStatus(errors);
  }

  destroy(): void {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.unsubscribe();
    window.removeEventListener('resize', this.onResize);
    this.scene.scale.off('resize', this.onResize);
    this.textarea.remove();
    this.applyButton.destroy();
    this.cancelButton.destroy();
    this.exampleButton.destroy();
    this.mcpButton.destroy();
    this.curtain.destroy();
    this.dim.destroy();
    this.frame.destroy();
    for (const entry of this.staticTexts) entry.obj.destroy();
    for (const t of this.statusTexts) t.destroy();
  }

  // --- open/close plumbing --------------------------------------------------

  private setOpen(open: boolean): void {
    // Only report a CHANGE. The constructor closes the panel once to get it into
    // a known state, and the scene would otherwise hear "closed" before its own
    // input controller exists.
    const changed = open !== this.opened;
    this.opened = open;
    this.dim.setVisible(open);
    this.frame.setVisible(open);
    this.curtain.setVisible(open);
    this.applyButton.container.setVisible(open);
    this.cancelButton.container.setVisible(open);
    this.exampleButton.container.setVisible(open);
    this.mcpButton.container.setVisible(open);
    for (const entry of this.staticTexts) entry.obj.setVisible(open);
    for (const t of this.statusTexts) t.setVisible(open);
    this.textarea.style.display = open ? 'block' : 'none';
    if (open) {
      window.addEventListener('resize', this.onResize);
      this.scene.scale.on('resize', this.onResize);
    } else {
      window.removeEventListener('resize', this.onResize);
      this.scene.scale.off('resize', this.onResize);
      this.textarea.blur();
    }
    if (changed) this.handlers.onOpenChange?.(open);
  }

  // --- the DOM paste box ----------------------------------------------------

  private makeTextarea(): HTMLTextAreaElement {
    const el = document.createElement('textarea');
    el.spellcheck = false;
    el.autocapitalize = 'off';
    el.autocomplete = 'off';
    el.setAttribute('wrap', 'off');
    el.setAttribute('aria-label', 'Tracklet Script');
    el.placeholder = 'new\nsong "MY TUNE"\ntempo 128\ntracks 4\n\nC-4 . . .';
    Object.assign(el.style, {
      position: 'fixed',
      display: 'none',
      zIndex: '50',
      boxSizing: 'border-box',
      margin: '0',
      borderStyle: 'solid',
      borderWidth: '1px',
      borderRadius: '0',
      resize: 'none',
      outline: 'none',
      overflow: 'auto',
      whiteSpace: 'pre',
      fontFamily: "'SFMono-Regular', Menlo, Consolas, 'Courier New', monospace",
      lineHeight: '1.3',
      opacity: '0.97',
    } satisfies Partial<CSSStyleDeclaration>);
    el.addEventListener('input', () => {
      this.overrideErrors = null;
      this.scheduleRefresh();
    });
    // Escape closes and Ctrl+Enter applies: the two things the hands reach for
    // while typing in a box.
    el.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.apply();
      }
    });
    document.body.appendChild(el);
    return el;
  }

  /** Map the canvas-space box onto the canvas's current on-screen rect. */
  private place(): void {
    const r = this.scene.game.canvas.getBoundingClientRect();
    const sx = r.width / CANVAS_W;
    const sy = r.height / CANVAS_H;
    const s = this.textarea.style;
    s.left = `${Math.round(r.left + BOX.x * sx)}px`;
    s.top = `${Math.round(r.top + BOX.y * sy)}px`;
    s.width = `${Math.round(BOX.width * sx)}px`;
    s.height = `${Math.round(BOX.height * sy)}px`;
    // The window gives the baseline and the TEXT SIZE setting multiplies it, so
    // the box is as large as the screen allows and as large as the reader asked
    // for on top of that. The box itself does not grow — it is a canvas rect — so
    // a bigger size means fewer lines fit, which is the honest trade.
    s.fontSize = `${Math.max(10, Math.round(10 * sy * activeTextScaleFactor()))}px`;
    s.padding = `${Math.max(2, Math.round(4 * sy))}px`;
    this.paintTextareaColors();
  }

  private paintTextareaColors(): void {
    const c = activeColors();
    const s = this.textarea.style;
    s.backgroundColor = intToCss(c.ink);
    s.color = intToCss(c.textPrimary);
    s.borderColor = intToCss(c.stoneHi);
    s.caretColor = intToCss(c.ward);
  }

  // --- actions --------------------------------------------------------------

  private loadExample(): void {
    this.textarea.value = SCRIPT_EXAMPLE;
    this.overrideErrors = null;
    this.textarea.focus();
    this.refresh();
  }

  private apply(): void {
    this.handlers.onApply?.(this.textarea.value);
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refresh();
    }, 140);
  }

  // --- rendering ------------------------------------------------------------

  /** Re-parse the box and redraw the verdict. Never touches the song. */
  private refresh(): void {
    const errors = this.overrideErrors ?? parseScript(this.textarea.value, this.context).errors;
    this.overrideErrors = null;
    this.renderStatus(errors);
  }

  private renderStatus(errors: ScriptDiagnostic[]): void {
    for (const t of this.statusTexts) t.destroy();
    this.statusTexts = [];

    const c = activeColors();
    const hasText = this.textarea.value.trim() !== '';

    // A verdict is built as ROWS, not lines: a long diagnostic wraps, and a
    // message that runs off the right edge is a message nobody reads. `push`
    // refuses rather than overflows, so the panel never spills past its frame.
    const rows: StatusLine[] = [];
    const push = (text: string, color: number): boolean => {
      const parts = this.wrapped(text);
      if (rows.length + parts.length > MAX_STATUS_LINES) return false;
      for (const part of parts) rows.push({ text: part, color });
      return true;
    };

    if (errors.length > 0) {
      push(`FIX THESE (${errors.length})`, c.danger);
      let shown = 0;
      for (const error of errors) {
        if (!push(`LINE ${String(error.line).padStart(2, '0')}  ${error.message}`, c.danger)) break;
        shown += 1;
      }
      if (shown < errors.length) push(`...and ${errors.length - shown} more mistake(s).`, c.textDim);
    } else if (!hasText) {
      push('READY', c.textDim);
      push('PASTE A SCRIPT, OR PRESS LOAD EXAMPLE.', c.textDim);
    } else {
      // It parses; count the statements so the author sees it was understood.
      const parsed = parseScript(this.textarea.value, this.context);
      push('READY TO APPLY', c.textGreen);
      push(`${parsed.commands.length} STATEMENTS UNDERSTOOD.`, c.textDim);
      push('AND THE SONG CONTAINS NO MISTAKES.', c.textDim);
      push('APPLY REPLACES THE WHOLE SONG. CTRL+Z TAKES IT BACK.', c.textPrimary);
    }

    // Rebuilt from scratch on every check, so a stale verdict can never linger.
    // They are born at the panel's current visibility: the constructor checks an
    // empty box while the modal is still closed, and those rows must not paint
    // themselves over the pattern grid.
    const area = statusArea();
    rows.forEach((row, i) => {
      const t = this.addText(area.x, area.y + i * 11, row.text, 8, row.color);
      t.setVisible(this.opened);
      this.statusTexts.push(t);
    });
    this.applyButton.setEnabled(errors.length === 0 && hasText);
  }

  /**
   * Break one verdict string into pieces that fit the status column. Measured
   * rather than guessed: the framework's pixel font has its own metrics, and a
   * hard-coded character budget would be wrong the day the face changes.
   */
  private wrapped(text: string): string[] {
    const probe = uiText(this.scene, -9999, -9999, text, { size: 8 });
    const width = probe.width;
    probe.destroy();
    if (width <= BOX.width) return [text];
    const perLine = Math.max(8, Math.floor(text.length * (BOX.width / width)));
    return splitWords(text, perLine);
  }

  /** Repaint the frame, the textarea's tint and every label. Theme-safe. */
  renderChrome(): void {
    const c = activeColors();
    const theme = activeTheme();

    this.dim.clear();
    this.dim.fillStyle(c.ink, 0.74);
    this.dim.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const frame = this.frame;
    frame.clear();
    drawPanel(frame, MODAL, 1, c);
    drawDivider(frame, MODAL.x + 2, MODAL.y + 12, MODAL.width - 4, 1, c);
    // The paste box's own well, so the area still reads as part of the panel
    // even before the DOM overlay has painted.
    drawInset(frame, BOX, 1, c);
    drawDivider(frame, BOX.x, statusArea().y - 8, BOX.width, 1, c);

    this.paintTextareaColors();

    const roleColor: Record<TextRole, number> = {
      heading: c.textDim,
      body: c.textPrimary,
      accent: theme.colors.ooze,
      dim: c.textDim,
    };
    for (const entry of this.staticTexts) entry.obj.setColor(intToCss(roleColor[entry.role]));

    this.refresh();
  }

  private addStatic(x: number, y: number, text: string, role: TextRole): void {
    const obj = this.addText(x, y, text, 8, activeColors().textPrimary);
    this.staticTexts.push({ obj, role });
  }

  private addText(x: number, y: number, text: string, size: number, color: number): Phaser.GameObjects.Text {
    const t = uiText(this.scene, x, y, text, { size, color });
    t.setDepth(DEPTH_FRONT);
    return t;
  }
}

/** The frame's inner content rect, matching what a `Panel` would hand back. */
function panelBody(rect: Rect): Rect {
  const pad = 4;
  return {
    x: rect.x + pad,
    y: rect.y + 12 + pad,
    width: rect.width - pad * 2,
    height: rect.height - 12 - pad * 2,
  };
}

/** Where the verdict (errors or summary) is drawn. */
function statusArea(): { x: number; y: number } {
  return { x: BOX.x, y: BOX.y + BOX.height + 16 };
}

/** Greedily wrap at spaces, hard-splitting a word longer than the budget. */
function splitWords(text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line === '') {
      line = word;
    } else if (line.length + 1 + word.length <= max) {
      line += ` ${word}`;
    } else {
      out.push(line);
      line = word;
    }
    while (line.length > max) {
      out.push(line.slice(0, max));
      line = line.slice(max);
    }
  }
  if (line !== '') out.push(line);
  return out;
}
