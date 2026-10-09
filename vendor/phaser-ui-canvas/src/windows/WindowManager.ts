import type { Rect } from '../types';
import type { Window } from './Window';

/**
 * WindowManager — z-order and focus for a set of windows.
 *
 * It keeps a rising depth counter so the most recently focused window is on
 * top, closes windows cleanly, and (optionally) keeps them inside a bounds
 * rect. It deliberately does NOT own layout or input routing: a window is
 * still just a Window, and an app that wants a single panel never needs this.
 */
export class WindowManager {
  private readonly windows: Window[] = [];
  private z = 0;

  constructor(
    private readonly bounds?: Rect,
    private readonly baseDepth = 900,
  ) {}

  /** Every open window, bottom to top. */
  get all(): readonly Window[] { return this.windows; }

  /**
   * Add a window and focus it.
   *
   * The manager acts on the close button, but it does not *steal* it: a caller
   * that brought its own `onClose` (a panel that wants to tidy up when it is
   * closed) still gets called, and the window leaves the manager either way.
   * Overwriting that handler used to be the whole bug — the window vanished and
   * the object that owned it never found out.
   */
  open(win: Window): Window {
    this.windows.push(win);
    const handedOver = win.onClose;
    win.onClose = () => {
      this.forget(win);
      if (handedOver) handedOver();
      else win.destroy();
    };
    this.focus(win);
    return win;
  }

  /** Drop a window from the list without touching it. */
  forget(win: Window): void {
    const i = this.windows.indexOf(win);
    if (i >= 0) this.windows.splice(i, 1);
  }

  /** Bring a window to the front. */
  focus(win: Window): void {
    this.z += 1;
    win.setDepth(this.baseDepth + this.z);
  }

  /** The topmost window containing the point, or null. */
  windowAt(x: number, y: number): Window | null {
    const sorted = [...this.windows].sort((a, b) => b.depth - a.depth);
    return sorted.find((w) => w.contains(x, y)) ?? null;
  }

  /** Close and destroy a window. Safe to call twice, or after it is gone. */
  close(win: Window): void {
    this.forget(win);
    win.destroy();
  }

  /** Close every window. */
  closeAll(): void {
    for (const w of [...this.windows]) this.close(w);
  }

  /** Fit a window inside the manager's bounds (no-op without bounds). */
  clamp(win: Window): void {
    if (!this.bounds) return;
    const p = win.position;
    win.moveTo(p.x, p.y, this.bounds);
  }

  destroy(): void {
    this.closeAll();
  }
}
