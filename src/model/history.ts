/**
 * history — an undo/redo stack, with no idea what it is undoing.
 *
 * It holds whole SNAPSHOTS rather than inverse commands. For a song this size
 * that is the right trade: snapshots are tiny, they cannot drift out of sync
 * with the state they describe, and "undo a track deletion" is free instead of
 * being a special case. A larger project would swap in a command log behind the
 * same three calls.
 *
 * Phaser-free on purpose — the rules are worth testing, and they are the part
 * users notice most: recording a new state must discard the redo branch, and
 * the stacks must not grow without bound.
 */

export const DEFAULT_HISTORY_LIMIT = 64;

export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  private readonly limit: number;

  constructor(limit: number = DEFAULT_HISTORY_LIMIT) {
    this.limit = Math.max(1, limit);
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get depth(): number { return this.undoStack.length; }

  /**
   * Every remembered state, OLDEST first, as a copy.
   *
   * For a view that shows the past rather than stepping through it: the stack is
   * the past in order, and handing out a copy means a caller cannot corrupt the
   * timeline by sorting or shifting the list it was given. The state on screen
   * now is NOT in here — it becomes reachable by undoing once — so a caller that
   * wants "the whole story" puts the present on the end itself.
   */
  states(): T[] {
    return [...this.undoStack];
  }

  /**
   * Remember a state BEFORE changing it. Recording discards the redo branch:
   * once you do something new, the future you undid away is unreachable.
   */
  record(state: T): void {
    this.undoStack.push(state);
    while (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** Step back: hand back the previous state, parking `current` for redo. */
  undo(current: T): T | null {
    const previous = this.undoStack.pop();
    if (previous === undefined) return null;
    this.redoStack.push(current);
    return previous;
  }

  /** Step forward again: the mirror of `undo`. */
  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    return next;
  }

  /** Forget everything (a new song starts a new timeline). */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
