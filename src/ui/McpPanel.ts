/**
 * McpPanel — the MCP modal: how to hand this app's music to an AI agent.
 *
 * It is opened from the MCP button inside the SCRIPT box, and it is the one place
 * in the app that answers "how do I get something else to write music here?".
 * Everything it says is in `mcpAgent.ts`, which is pure and Phaser-free; this file
 * is only the drawing and the two things a canvas can do that a string cannot:
 * ask the server whether it is up, and put the config on the clipboard.
 *
 * It is a plain canvas modal like F1 and F10 — read-only, no DOM, nothing to
 * apply and nothing to undo — with one live part, which is the status line. That
 * line is the whole reason the panel exists rather than a paragraph in the docs:
 * "point your client at this endpoint" is a sentence whose failure mode is
 * invisible, and a green line that says RUNNING is the difference between a config
 * that is wrong and a server that was never started.
 *
 * Three details worth knowing:
 *
 *   • THE PROBE IS THE ONLY ASYNC THING HERE, and its answer is discarded if the
 *     panel has been closed in the meantime — a panel that painted a result onto
 *     itself after being dismissed would leave text floating over the grid.
 *   • THE CONFIG IS COPIED, NOT TYPED. A URL with a port in it is exactly the sort
 *     of thing a hand miscopies, so there is a button and a confirmation.
 *   • NOTHING HERE PROMISES MORE THAN THE TRUTH. The server is a separate process:
 *     it cannot see the song in the editor. The panel says that plainly rather than
 *     implying an agent is sitting inside this window.
 */

import type Phaser from 'phaser';
import {
  activeColors,
  activeTheme,
  Button,
  drawDivider,
  drawPanel,
  intToCss,
  onThemeChanged,
  uiText,
  type Rect,
} from 'phaser-ui-canvas';

import {
  AGENT_CAVEAT,
  AGENT_HTTP_LABEL,
  AGENT_RETYPE_NOTE,
  AGENT_STDIO_LABEL,
  AGENT_STEPS,
  AGENT_SURFACE,
  agentEndpoint,
  agentHttpConfigLines,
  agentHttpConfigText,
  agentStartCommand,
  agentStatusDetail,
  agentStatusLine,
  agentStdioConfigLines,
  agentStdioConfigText,
  checkingAgentState,
  probeAgentServer,
  type AgentState,
} from './mcpAgent';

export interface McpPanelHandlers {
  /** The panel opened or closed, so the scene can pause its own input. */
  onOpenChange?: (open: boolean) => void;
}

/** The canvas the app is drawn in. */
const CANVAS_W = 720;
const CANVAS_H = 405;

/** The modal frame, in canvas coordinates — the same one the SCRIPT box uses. */
const MODAL: Rect = { x: 44, y: 14, width: 632, height: 377 };

/** The left column (the steps) and the right one (the server and the config). */
const LEFT_X = MODAL.x + 8;
const LEFT_W = 160;
const RIGHT_X = MODAL.x + 184;
const RIGHT_W = MODAL.x + MODAL.width - 8 - RIGHT_X;

/**
 * Render depths: above the SCRIPT box (which is 880-900) and below the toast at
 * 950, so a confirmation is visible over this panel the same way it is over the
 * rest of the app.
 */
const DEPTH_DIM = 910;
const DEPTH_CURTAIN = 912;
const DEPTH_FRAME = 920;
const DEPTH_FRONT = 930;

/** Line spacing for the config block, which is the densest thing on the panel. */
const CONFIG_LINE_H = 10;

/** Which theme colour a piece of static copy wears, so a recolour can find it. */
type TextRole = 'heading' | 'body' | 'accent' | 'dim';

interface StaticText {
  obj: Phaser.GameObjects.Text;
  role: TextRole;
}

export class McpPanel {
  private readonly scene: Phaser.Scene;
  private readonly handlers: McpPanelHandlers;

  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly checkButton: Button;
  private readonly copyUrlButton: Button;
  private readonly copyStdioButton: Button;
  private readonly closeButton: Button;

  private readonly staticTexts: StaticText[] = [];
  private statusText: Phaser.GameObjects.Text | null = null;
  private detailText: Phaser.GameObjects.Text | null = null;
  private hintText: Phaser.GameObjects.Text | null = null;

  /** One probe at a time; a second press while one is out is ignored. */
  private probing = false;
  private flash: string | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  private state: AgentState;
  private opened = false;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, handlers: McpPanelHandlers = {}) {
    this.scene = scene;
    this.handlers = handlers;
    this.state = checkingAgentState();

    this.dim = scene.add.graphics().setDepth(DEPTH_DIM);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);

    // A full-screen zone in front of the app, so a stray click cannot edit the
    // song behind the panel. It does NOT dismiss on click, unlike the menus that
    // are just a list: there is a config to read and a button to press here, and
    // a read-only page that closes when you click its margins is a page you
    // cannot select text on anyway.
    this.curtain = scene.add.zone(0, 0, CANVAS_W, CANVAS_H).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);

    this.addStatic(MODAL.x + 4, MODAL.y + 2, 'MCP  -  LET AN AI AGENT WRITE MUSIC', 'accent');

    // --- the left column: the three steps -----------------------------------
    this.addStatic(LEFT_X, 40, 'HOW AN AGENT CONNECTS', 'heading');
    let y = 56;
    for (const step of AGENT_STEPS) {
      this.addStatic(LEFT_X, y, step.label, 'body');
      this.addStatic(LEFT_X + 6, y + 11, step.text, 'dim');
      y += 28;
    }

    // --- the left column: what it can reach, and what it cannot ---------------
    let surfaceY = y + 4;
    for (const line of AGENT_SURFACE) {
      this.addStatic(LEFT_X, surfaceY, line, surfaceY === y + 4 ? 'heading' : 'body');
      surfaceY += 12;
    }
    const caveat = uiText(this.scene, LEFT_X, surfaceY + 10, AGENT_CAVEAT, {
      size: 8,
      color: activeColors().textDim,
      wordWrapWidth: LEFT_W - 4,
    });
    caveat.setDepth(DEPTH_FRONT);
    this.staticTexts.push({ obj: caveat, role: 'dim' });

    // --- the right column: the server, the command, the config ---------------
    this.addStatic(RIGHT_X, 40, 'THE AGENT SERVER', 'heading');
    this.addStatic(RIGHT_X, 88, 'START IT WITH', 'heading');
    this.addStatic(RIGHT_X, 100, agentStartCommand(), 'accent');
    this.addStatic(RIGHT_X, 124, 'ENDPOINT', 'heading');
    this.addStatic(RIGHT_X, 136, agentEndpoint(), 'accent');

    // Two configs, one under the other, each with its own button: a client takes
    // a URL or it takes a command, and the panel has no way to know which — so it
    // shows both rather than making one of them "the documentation".
    this.addStatic(RIGHT_X, 160, AGENT_HTTP_LABEL, 'heading');
    let configY = 172;
    for (const line of agentHttpConfigLines()) {
      this.addStatic(RIGHT_X, configY, line, 'body');
      configY += CONFIG_LINE_H;
    }
    this.addStatic(RIGHT_X, 266, AGENT_STDIO_LABEL, 'heading');
    let stdioY = 278;
    for (const line of agentStdioConfigLines()) {
      this.addStatic(RIGHT_X, stdioY, line, 'body');
      stdioY += CONFIG_LINE_H;
    }
    // Why there are two COPY buttons rather than a block to read off the screen.
    this.addStatic(RIGHT_X, 330, AGENT_RETYPE_NOTE, 'dim');

    // --- buttons -------------------------------------------------------------
    const btnY = MODAL.y + MODAL.height - 26;
    const right = MODAL.x + MODAL.width - 8;
    this.closeButton = new Button(scene, { x: right - 96, y: btnY, width: 96, height: 20 }, 'CLOSE', { size: 8, icon: 'close' });
    this.closeButton.container.setDepth(DEPTH_FRONT);
    this.closeButton.onPress = () => this.hide();
    this.copyStdioButton = new Button(scene, { x: right - 204, y: btnY, width: 100, height: 20 }, 'COPY CMD', { size: 8 });
    this.copyStdioButton.container.setDepth(DEPTH_FRONT);
    this.copyStdioButton.onPress = () => this.copyConfig('command');
    this.copyUrlButton = new Button(scene, { x: right - 312, y: btnY, width: 100, height: 20 }, 'COPY URL', { size: 8 });
    this.copyUrlButton.container.setDepth(DEPTH_FRONT);
    this.copyUrlButton.onPress = () => this.copyConfig('url');
    this.checkButton = new Button(scene, { x: RIGHT_X, y: btnY, width: 116, height: 20 }, 'CHECK AGAIN', { size: 8 });
    this.checkButton.container.setDepth(DEPTH_FRONT);
    this.checkButton.onPress = () => this.check();

    this.unsubscribe = onThemeChanged(() => this.renderChrome());
    this.setOpen(false);
    this.renderChrome();
  }

  /** True while the panel is up; the scene uses it to suspend its own input. */
  get isOpen(): boolean {
    return this.opened;
  }

  /** The last thing the panel learned about the server, for a test or a log. */
  get agentState(): AgentState {
    return this.state;
  }

  /** Show it, and ask the server whether it is up. */
  show(): void {
    if (this.opened) return;
    this.state = checkingAgentState();
    this.flash = null;
    this.setOpen(true);
    this.renderChrome();
    void this.check();
  }

  hide(): void {
    if (!this.opened) return;
    this.clearFlash();
    this.setOpen(false);
  }

  toggle(): void {
    if (this.opened) this.hide();
    else this.show();
  }

  /** Escape closes; there is nothing else here to steer. */
  handleKey(e: KeyboardEvent): void {
    if (e.code === 'Escape') {
      e.preventDefault();
      this.hide();
    }
  }

  destroy(): void {
    this.clearFlash();
    this.unsubscribe();
    this.checkButton.destroy();
    this.copyUrlButton.destroy();
    this.copyStdioButton.destroy();
    this.closeButton.destroy();
    this.curtain.destroy();
    this.dim.destroy();
    this.frame.destroy();
    for (const entry of this.staticTexts) entry.obj.destroy();
    this.statusText?.destroy();
    this.detailText?.destroy();
    this.hintText?.destroy();
  }

  // --- the two things a canvas cannot do with a string ----------------------

  /** Ask the server, and paint the answer — unless the panel has been closed. */
  private async check(): Promise<void> {
    if (this.probing) return;
    this.probing = true;
    this.state = { ...this.state, status: 'checking', reason: null };
    this.renderLive();
    const answer = await probeAgentServer();
    this.probing = false;
    // The panel may have been closed while the request was out; a result painted
    // onto a dismissed modal is text floating over the grid.
    if (!this.opened) return;
    this.state = answer;
    this.renderLive();
  }

  /**
   * Copy one of the two configs.
   *
   * Which one it copied is in the confirmation, because the two look alike and
   * pasting the wrong one produces a client that cannot start anything — the
   * failure this whole panel exists to head off.
   */
  private copyConfig(which: 'url' | 'command'): void {
    const text = which === 'url' ? agentHttpConfigText() : agentStdioConfigText();
    const done = `COPIED THE ${which === 'url' ? 'URL' : 'COMMAND'} CONFIG. RESTART YOUR CLIENT.`;
    const say = (message: string) => this.say(message);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => say(done),
        () => say(copyByHand(text) ? done : 'COULD NOT REACH THE CLIPBOARD.'),
      );
      return;
    }
    say(copyByHand(text) ? done : 'COULD NOT REACH THE CLIPBOARD.');
  }

  /** Show a sentence in the hint line for a moment, then put the hint back. */
  private say(message: string): void {
    this.clearFlash();
    this.flash = message;
    this.renderLive();
    this.flashTimer = setTimeout(() => {
      this.flash = null;
      this.flashTimer = null;
      this.renderLive();
    }, 2600);
  }

  private clearFlash(): void {
    if (this.flashTimer !== null) clearTimeout(this.flashTimer);
    this.flashTimer = null;
    this.flash = null;
  }

  // --- open/close plumbing --------------------------------------------------

  private setOpen(open: boolean): void {
    // Only report a CHANGE: the constructor closes once to reach a known state,
    // and the scene would otherwise hear "closed" before its input exists.
    const changed = open !== this.opened;
    this.opened = open;
    this.dim.setVisible(open);
    this.frame.setVisible(open);
    this.curtain.setVisible(open);
    this.checkButton.container.setVisible(open);
    this.copyUrlButton.container.setVisible(open);
    this.copyStdioButton.container.setVisible(open);
    this.closeButton.container.setVisible(open);
    for (const entry of this.staticTexts) entry.obj.setVisible(open);
    this.statusText?.setVisible(open);
    this.detailText?.setVisible(open);
    this.hintText?.setVisible(open);
    if (changed) this.handlers.onOpenChange?.(open);
  }

  // --- drawing --------------------------------------------------------------

  /** The chrome and the static copy: rebuilt only when the theme changes. */
  private renderChrome(): void {
    for (const entry of this.staticTexts) entry.obj.setVisible(this.opened);

    const c = activeColors();
    const theme = activeTheme();

    this.dim.clear();
    this.dim.fillStyle(c.ink, 0.8);
    this.dim.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const frame = this.frame;
    frame.clear();
    drawPanel(frame, MODAL, 1, c);
    drawDivider(frame, MODAL.x + 2, MODAL.y + 12, MODAL.width - 4, 1, c);
    drawDivider(frame, MODAL.x + 8, MODAL.y + MODAL.height - 34, MODAL.width - 16, 1, c);
    // A column rule, so the steps and the config read as two halves rather than
    // as one long page that happens to have a gap in the middle.
    const ruleX = RIGHT_X - 8;
    frame.fillStyle(c.textDim, 0.35);
    frame.fillRect(ruleX, 38, 1, MODAL.height - 82);

    const roleColor: Record<TextRole, number> = {
      heading: c.textDim,
      body: c.textPrimary,
      accent: theme.colors.ooze,
      dim: c.textDim,
    };
    for (const entry of this.staticTexts) entry.obj.setColor(intToCss(roleColor[entry.role]));

    this.renderLive();
  }

  /** The three lines that change: the verdict, the detail and the hint. */
  private renderLive(): void {
    const c = activeColors();
    const theme = activeTheme();
    const statusY = 52;
    const accent = theme.colors.ooze;

    if (!this.statusText) {
      this.statusText = uiText(this.scene, RIGHT_X + 12, statusY, '', { size: 9, color: c.textGreen });
      this.statusText.setDepth(DEPTH_FRONT);
      this.detailText = uiText(this.scene, RIGHT_X, statusY + 14, '', { size: 8, color: c.textPrimary, wordWrapWidth: RIGHT_W });
      this.detailText.setDepth(DEPTH_FRONT);
      this.hintText = uiText(this.scene, MODAL.x + 8, MODAL.y + MODAL.height - 28, '', { size: 8, color: c.textDim });
      this.hintText.setDepth(DEPTH_FRONT);
    }

    const running = this.state.status === 'running';
    this.statusText.setText(agentStatusLine(this.state));
    this.statusText.setColor(intToCss(running ? c.textGreen : this.state.status === 'checking' ? c.textDim : c.ward));
    this.statusText.setVisible(this.opened);

    this.detailText?.setText(agentStatusDetail(this.state));
    this.detailText?.setColor(intToCss(c.textPrimary));
    this.detailText?.setVisible(this.opened);

    this.hintText?.setText(this.flash ?? 'ESC OR CLOSE GOES BACK TO THE SCRIPT BOX');
    this.hintText?.setColor(intToCss(this.flash ? accent : c.textDim));
    this.hintText?.setVisible(this.opened);

    // The dot beside the verdict, drawn rather than typed: a glyph would be a
    // second font to line up, and this is one circle.
    this.frame.fillStyle(running ? c.textGreen : c.textDim, this.state.status === 'checking' ? 0.4 : 1);
    this.frame.fillCircle(RIGHT_X + 4, statusY + 5, 3);
    if (!running) {
      this.frame.lineStyle(1, c.textDim, 1);
      this.frame.strokeCircle(RIGHT_X + 4, statusY + 5, 3);
    }
    this.frame.setVisible(this.opened);
  }

  private addStatic(x: number, y: number, text: string, role: TextRole): void {
    const obj = uiText(this.scene, x, y, text, { size: 8, color: activeColors().textPrimary });
    obj.setDepth(DEPTH_FRONT);
    this.staticTexts.push({ obj, role });
  }
}

/**
 * Copy without the Clipboard API, for a browser that refuses it.
 *
 * `execCommand` is deprecated and still the only fallback there is; a textarea is
 * how the SCRIPT box already gets the clipboard to behave, so this is the same
 * trick with the copy half rather than the paste half.
 */
function copyByHand(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  Object.assign(area.style, { position: 'fixed', top: '0', left: '0', opacity: '0' });
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
