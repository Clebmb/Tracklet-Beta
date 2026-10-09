import Phaser from 'phaser';
import type { InputSource, NavDir, NavEdge, NavPageDir } from '../types';

/**
 * MenuInputController — converts raw keyboard + gamepad state into *edge
 * events* (confirm / cancel / pause / page / action / dir taps and holds), so
 * a menu can never double-move from one press.
 *
 * The rules, which are the hard-won part of this class and were lifted
 * verbatim from the original UI:
 *
 * - Keyboard and gamepad share one action space: arrows + WASD are directions,
 *   Enter/Space confirm, Escape cancels, Tab (and LB/RB) cycle pages.
 * - A direction TAP fires once per press; HOLDING re-fires after an initial
 *   delay and then repeats at a fixed cadence (classic menu feel).
 * - Press edges for confirm/cancel/action are latched from the `keydown`
 *   EVENT rather than sampled in `update()`, because a poll only sees a key
 *   that happens to be down when a frame lands — a quick tap that begins and
 *   ends between two frames is silently dropped, which is exactly what an
 *   Escape tap looks like at a low frame rate.
 * - `suppressAll()` marks every other channel as seen when one fires, so a
 *   single physical press can never produce two edges.
 * - Stick tap-through: crossing the threshold fires once and latches until the
 *   stick returns near centre, so a full-stick flick never double-taps.
 *
 * Bindings are configurable. The defaults reproduce the original scheme, so a
 * caller that passes nothing gets the familiar controls.
 */

/** Keyboard codes per direction, plus which gamepad button/axis drives it. */
export interface DirBinding {
  keyboard?: number[];
  padButton?: number;
  /** Gamepad stick axis index (0 = X, 1 = Y), or omitted for none. */
  axis?: number;
  /** True when the NEGATIVE end of the axis is this direction. */
  negative?: boolean;
}

export interface MenuInputConfig {
  dirs?: Partial<Record<NavDir, DirBinding>>;
  /** Keyboard codes per action. */
  keys?: {
    confirm?: number[];
    cancel?: number[];
    pause?: number[];
    pagePrev?: number[];
    pageNext?: number[];
    action?: number[];
  };
  /** Gamepad button index per action. */
  pad?: {
    confirm?: number;
    cancel?: number;
    pause?: number;
    action?: number;
    pagePrev?: number;
    pageNext?: number;
  };
  /** TAB alternates pages (next/prev) on the keyboard when true. Default true. */
  tabPages?: boolean;
  /** Hold cadence for directions (ms). */
  repeatFirstMs?: number;
  repeatEveryMs?: number;
}

type NamedAction = 'confirm' | 'cancel' | 'pause' | 'action';

interface DirChannel {
  keyboard: number[];
  padButton: number;
  axis: number | null;
  negative: boolean;
  down: boolean;
  heldMs: number;
}

interface ButtonChannel {
  keyboard: number[];
  padButton: number;
  down: boolean;
}

const K = Phaser.Input.Keyboard.KeyCodes;

export const DEFAULT_DIRS: Record<NavDir, DirBinding> = {
  up: { keyboard: [K.UP, K.W], padButton: 12, axis: 1, negative: true },
  down: { keyboard: [K.DOWN, K.S], padButton: 13, axis: 1, negative: false },
  left: { keyboard: [K.LEFT, K.A], padButton: 14, axis: 0, negative: true },
  right: { keyboard: [K.RIGHT, K.D], padButton: 15, axis: 0, negative: false },
};

export const DEFAULT_KEYS = {
  confirm: [K.ENTER, K.SPACE],
  cancel: [K.ESC],
  pause: [] as number[],
  pagePrev: [] as number[],
  pageNext: [] as number[],
  action: [K.F],
};

export const DEFAULT_PAD = {
  confirm: 0,
  cancel: 1,
  action: 2,
  pagePrev: 4,
  pageNext: 5,
  pause: 9,
};

export class MenuInputController {
  private readonly scene: Phaser.Scene;
  private readonly cfg: Required<Pick<MenuInputConfig, 'tabPages' | 'repeatFirstMs' | 'repeatEveryMs'>>;
  private keys: Partial<Record<number, Phaser.Input.Keyboard.Key>> = {};
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;
  private stickCooldown = 0;
  private stickArmed = true;

  private dirs: Record<NavDir, DirChannel>;
  private confirm: ButtonChannel;
  private cancel: ButtonChannel;
  private pause: ButtonChannel;
  private pageL: ButtonChannel;
  private pageR: ButtonChannel;
  private action: ButtonChannel;
  private tabDown = false;
  private tabAlternate = false;

  /** Press edges latched from the keydown event rather than sampled. */
  private latched: Record<NamedAction, boolean> = { confirm: false, cancel: false, pause: false, action: false };
  private enabled = false;

  private readonly padCfg: Required<NonNullable<MenuInputConfig['pad']>>;

  constructor(scene: Phaser.Scene, config: MenuInputConfig = {}) {
    this.scene = scene;
    this.cfg = {
      tabPages: config.tabPages ?? true,
      repeatFirstMs: config.repeatFirstMs ?? 320,
      repeatEveryMs: config.repeatEveryMs ?? 110,
    };
    this.padCfg = {
      confirm: config.pad?.confirm ?? DEFAULT_PAD.confirm,
      cancel: config.pad?.cancel ?? DEFAULT_PAD.cancel,
      action: config.pad?.action ?? DEFAULT_PAD.action,
      pagePrev: config.pad?.pagePrev ?? DEFAULT_PAD.pagePrev,
      pageNext: config.pad?.pageNext ?? DEFAULT_PAD.pageNext,
      pause: config.pad?.pause ?? DEFAULT_PAD.pause,
    };

    const dirs = { ...DEFAULT_DIRS, ...(config.dirs ?? {}) };
    const chan = (d: DirBinding): DirChannel => ({
      keyboard: d.keyboard ?? [],
      padButton: d.padButton ?? -1,
      axis: d.axis ?? null,
      negative: d.negative ?? false,
      down: false,
      heldMs: 0,
    });
    this.dirs = {
      up: chan(dirs.up), down: chan(dirs.down),
      left: chan(dirs.left), right: chan(dirs.right),
    };

    const keys = { ...DEFAULT_KEYS, ...(config.keys ?? {}) };
    this.confirm = { keyboard: keys.confirm, padButton: this.padCfg.confirm, down: false };
    this.cancel = { keyboard: keys.cancel, padButton: this.padCfg.cancel, down: false };
    this.pause = { keyboard: keys.pause, padButton: this.padCfg.pause, down: false };
    this.pageL = { keyboard: keys.pagePrev, padButton: this.padCfg.pagePrev, down: false };
    this.pageR = { keyboard: keys.pageNext, padButton: this.padCfg.pageNext, down: false };
    this.action = { keyboard: keys.action, padButton: this.padCfg.action, down: false };
  }

  /** (Re)bind keys. Safe to call repeatedly (idempotent key adds). */
  attach(): void {
    const kb = this.scene.input.keyboard;
    if (!kb) return;
    const codes = new Set<number>();
    for (const d of Object.values(this.dirs)) for (const c of d.keyboard) codes.add(c);
    for (const ch of [this.confirm, this.cancel, this.pause, this.pageL, this.pageR, this.action]) {
      for (const c of ch.keyboard) codes.add(c);
    }
    if (this.cfg.tabPages) codes.add(K.TAB);
    for (const c of codes) {
      if (!this.keys[c]) this.keys[c] = kb.addKey(c, true, false);
    }
    kb.on('keydown', this.onKeydown, this);
    this.scene.input.gamepad?.on('connected', this.onPadConnected, this);
    this.clearLatched();
    this.forgetHeldKeys();
    this.enabled = true;
  }

  detach(): void {
    const kb = this.scene.input.keyboard;
    if (kb) kb.off('keydown', this.onKeydown, this);
    this.clearLatched();
    this.enabled = false;
  }

  /** Per-frame poll; returns zero or one edge event (priority: buttons first). */
  update(dtMs: number): NavEdge | null {
    if (!this.enabled) return null;
    const kb = this.scene.input.keyboard;
    if (!kb) return null;

    // Cancel: the latched keydown press, or the polled edge (never both).
    const esc = this.keys[K.ESC];
    const escJust = esc ? Phaser.Input.Keyboard.JustDown(esc) : false;
    if (this.latched.cancel || escJust) {
      this.latched.cancel = false;
      this.suppressAll();
      return { action: 'cancel', source: 'keyboard' };
    }

    this.pad = this.scene.input.gamepad?.getPad(0) ?? null;
    if (this.stickCooldown > 0) this.stickCooldown -= dtMs;

    if (this.latched.confirm) {
      this.latched.confirm = false;
      this.suppressAll();
      return { action: 'confirm', source: 'keyboard' };
    }
    if (this.latched.action) {
      this.latched.action = false;
      this.suppressAll();
      return { action: 'action', name: 'action', source: 'keyboard' };
    }

    // Buttons first (confirm/cancel/pause take priority over directions).
    const confirmE = this.pollButton('confirm', this.confirm);
    if (confirmE) return confirmE;
    const cancelE = this.pollButton('cancel', this.cancel);
    if (cancelE) return cancelE;
    const pauseE = this.pollButton('pause', this.pause);
    if (pauseE) return pauseE;
    const actionE = this.pollButton('action', this.action);
    if (actionE) return actionE;

    // Shoulder buttons / Tab page-cycle.
    const pageL = this.pollPage(this.pageL, 'prev');
    if (pageL) return pageL;
    const pageR = this.pollPage(this.pageR, 'next');
    if (pageR) return pageR;

    if (this.cfg.tabPages) {
      const tab = this.keys[K.TAB];
      if (tab) {
        const downNow = tab.isDown;
        if (downNow && !this.tabDown) {
          this.tabDown = true;
          this.tabAlternate = !this.tabAlternate;
          this.suppressAll();
          return { action: 'page', pageDir: this.tabAlternate ? 'next' : 'prev', source: 'keyboard' };
        }
        if (!downNow) this.tabDown = false;
      }
    }

    // Directions.
    const up = this.pollDir('up', this.dirs.up, dtMs);
    if (up) return up;
    const down = this.pollDir('down', this.dirs.down, dtMs);
    if (down) return down;
    const left = this.pollDir('left', this.dirs.left, dtMs);
    if (left) return left;
    const right = this.pollDir('right', this.dirs.right, dtMs);
    if (right) return right;

    return null;
  }

  destroy(): void {
    const kb = this.scene.input.keyboard;
    if (kb) {
      kb.off('keydown', this.onKeydown, this);
      for (const k of Object.values(this.keys)) if (k) kb.removeKey(k, false);
    }
    this.scene.input.gamepad?.off('connected', this.onPadConnected, this);
    this.keys = {};
    this.enabled = false;
  }

  private pollPage(ch: ButtonChannel, pageDir: NavPageDir): NavEdge | null {
    const kbDown = ch.keyboard.some((c) => this.keys[c]?.isDown);
    const padDown = this.padDown(ch);
    if ((kbDown || padDown) && !ch.down) {
      ch.down = true;
      this.suppressAll();
      return { action: 'page', pageDir, source: padDown && !kbDown ? 'gamepad' : 'keyboard' };
    }
    if (!kbDown && !padDown) ch.down = false;
    return null;
  }

  private onPadConnected(): void {
    this.pad = this.scene.input.gamepad?.getPad(0) ?? null;
  }

  /** keydown listener: latch press edges and swallow default behaviour. */
  private onKeydown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    const code = (e as unknown as { keyCode: number }).keyCode;
    if (this.cancel.keyboard.includes(code)) this.latched.cancel = true;
    else if (this.confirm.keyboard.includes(code)) this.latched.confirm = true;
    else if (this.action.keyboard.includes(code)) this.latched.action = true;
    else if (this.pause.keyboard.includes(code)) this.latched.pause = true;

    const owned = Object.values(this.dirs).some((d) => d.keyboard.includes(code));
    if (owned || e.code === 'Enter' || e.code === 'Space' || e.code === 'Tab') {
      e.preventDefault();
    }
  }

  private clearLatched(): void {
    this.latched.confirm = false;
    this.latched.cancel = false;
    this.latched.pause = false;
    this.latched.action = false;
  }

  /**
   * Put every key we own back to its un-pressed state, on becoming attached.
   *
   * A controller is detached whenever a menu, dialog or text box wants the
   * keyboard — and the key that CLOSES one of those arrives while it is still
   * detached. The menu closes DURING that keydown, which re-attaches us, and the
   * press is still sitting on its `Key` as an unread "just down", because
   * nothing polled while we were away. The next `update()` reads it and hands
   * the app a `cancel` nobody asked for, so one Escape did two things: it closed
   * the menu, and then it answered the way-out question. That is the whole bug
   * behind "pressing Esc to close a menu makes the EXIT prompt appear".
   *
   * A press from before we were listening is not ours to act on. `Key.reset` is
   * Phaser's own for this ("resets this Key object back to its default
   * un-pressed state") and leaves the capture flags alone, so the browser keeps
   * swallowing the keys we own.
   */
  private forgetHeldKeys(): void {
    for (const key of Object.values(this.keys)) key?.reset();
  }

  /** Mark every channel as seen so one press cannot produce two edges. */
  private suppressAll(): void {
    for (const d of Object.values(this.dirs)) {
      d.down = true;
      d.heldMs = 0;
    }
    this.confirm.down = true;
    this.cancel.down = true;
    this.pause.down = true;
    this.pageL.down = true;
    this.pageR.down = true;
    this.action.down = true;
    this.tabDown = true;
  }

  private padDown(ch: ButtonChannel): boolean {
    return this.pad !== null && ch.padButton >= 0
      && this.pad.buttons.length > ch.padButton
      && this.pad.buttons[ch.padButton].pressed;
  }

  private pollButton(action: NamedAction, ch: ButtonChannel): NavEdge | null {
    const kbDown = ch.keyboard.some((c) => this.keys[c]?.isDown);
    const padDown = this.padDown(ch);
    const downNow = kbDown || padDown;
    if (downNow && !ch.down) {
      ch.down = true;
      this.suppressAll();
      const source: InputSource = padDown && !kbDown ? 'gamepad' : 'keyboard';
      // The pause latch was set in onKeydown; keep it consuming like the others.
      if (action === 'pause') this.latched.pause = false;
      return { action, ...(action === 'action' ? { name: 'action' } : {}), source };
    }
    if (!downNow) ch.down = false;
    return null;
  }

  /** True when the direction is down (keyboard, pad dpad, or stick deflection). */
  private dirDown(ch: DirChannel): boolean {
    if (ch.keyboard.some((c) => this.keys[c]?.isDown)) return true;
    if (this.pad !== null) {
      if (ch.padButton >= 0 && this.pad.buttons.length > ch.padButton
        && this.pad.buttons[ch.padButton].pressed) return true;
      if (ch.axis !== null && this.pad.axes.length > ch.axis) {
        const v = this.pad.axes[ch.axis].getValue();
        if (ch.negative ? v < -0.5 : v > 0.5) return true;
      }
    }
    return false;
  }

  private pollDir(dir: NavDir, ch: DirChannel, dtMs: number): NavEdge | null {
    const downNow = this.dirDown(ch);
    const padInvolved = this.pad !== null && (
      (ch.padButton >= 0 && this.pad.buttons.length > ch.padButton && this.pad.buttons[ch.padButton].pressed)
      || (ch.axis !== null && this.pad.axes.length > ch.axis
        && (ch.negative ? this.pad.axes[ch.axis].getValue() < -0.5 : this.pad.axes[ch.axis].getValue() > 0.5)));
    const source: InputSource = padInvolved ? 'gamepad' : 'keyboard';

    // Stick tap-through: crossing the threshold fires once and latches until
    // the stick returns near centre (or the opposite end), so a full-stick
    // flick never double-taps.
    if (ch.axis !== null && this.pad !== null && this.pad.axes.length > ch.axis) {
      const v = this.pad.axes[ch.axis].getValue();
      const far = ch.negative ? v : -v; // positive = "toward this dir"
      if (far > 0.5 && !ch.down && this.stickArmed && this.stickCooldown <= 0) {
        ch.down = true;
        this.stickArmed = false;
        this.stickCooldown = 180;
        this.suppressAll();
        return { action: 'dir', dir, source: 'gamepad' };
      }
      if (far < -0.95 || far < 0.1) this.stickArmed = true;
      if (far < 0.1 && ch.down && !this.dirDownKeyboardOrDpad(ch)) ch.down = false;
      // If only the stick is driving this channel, skip the held-repeat logic.
      if (!this.dirDownKeyboardOrDpad(ch)) return null;
    }

    if (downNow && !ch.down) {
      ch.down = true;
      ch.heldMs = 0;
      return { action: 'dir', dir, source };
    }
    if (downNow) {
      ch.heldMs += dtMs;
      if (ch.heldMs >= this.cfg.repeatFirstMs) {
        ch.heldMs -= this.cfg.repeatEveryMs;
        return { action: 'dir', dir, source, repeated: true };
      }
    } else {
      ch.down = false;
      ch.heldMs = 0;
    }
    return null;
  }

  private dirDownKeyboardOrDpad(ch: DirChannel): boolean {
    if (ch.keyboard.some((c) => this.keys[c]?.isDown)) return true;
    return this.pad !== null && ch.padButton >= 0
      && this.pad.buttons.length > ch.padButton
      && this.pad.buttons[ch.padButton].pressed;
  }
}
