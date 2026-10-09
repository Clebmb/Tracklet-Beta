/**
 * exitAnswer — what a key means to the way-out question, as DATA.
 *
 * `HostExitPrompt` owns the shade, the frame and the two buttons; this owns the
 * one decision it makes, because that decision is the difference between leaving
 * the app and not, and it is easier to be sure of as a function of two values
 * than as a `switch` inside a canvas class that a test cannot reach.
 *
 * ── The bug this exists to make impossible ──────────────────────────────────
 * `Enter` used to confirm, whatever was highlighted. The prompt opens with NO
 * focused — deliberately, because leaving throws away what is on screen — so
 * "press Enter on the button you are looking at" was a key that LEFT. The two
 * kinds of key are distinct and both are wanted:
 *
 *   • `y` and `n` (and Escape for no) mean an ANSWER, whatever is highlighted.
 *     A question with one-word answers is quicker to answer in words.
 *   • `Enter` and Space mean THE THING I AM LOOKING AT, which is what every other
 *     list and menu in these apps means by them.
 *
 * Confusing the two is not a subtle failure: the safe option became the one key
 * that obliged, in every editor in the kit at once.
 */

/** The two answers. `yes` leaves; `no` closes the question and stays. */
export type ExitChoice = 'yes' | 'no';

/** What one key does to the question. */
export type ExitKey =
  /** Answer it: `yes` navigates, `no` just closes. */
  | { kind: 'answer'; choice: ExitChoice }
  /** Move the highlight to the other option. */
  | { kind: 'focus'; choice: ExitChoice }
  /** Not a key of this question: the caller should leave it alone. */
  | { kind: 'ignore' };

/**
 * The meaning of `key` while `focused` is highlighted.
 *
 * `key` is `KeyboardEvent.key`, so the letters are the typed character and are
 * matched in both cases (a held Shift should not turn "no" into nothing).
 */
export function exitKey(key: string, focused: ExitChoice): ExitKey {
  switch (key) {
    // The two answers, said in words: unambiguous, so they act directly rather
    // than moving the highlight first.
    case 'y': case 'Y': return { kind: 'answer', choice: 'yes' };
    case 'n': case 'N': return { kind: 'answer', choice: 'no' };

    // Escape is the universal "no" — and the key that is already in the user's
    // hand, because in four of these apps it is what opened the question.
    case 'Escape': return { kind: 'answer', choice: 'no' };

    // Enter and Space answer the HIGHLIGHTED option, never a fixed one.
    case 'Enter': case ' ': return { kind: 'answer', choice: focused };

    // The arrows (and WASD, and Tab, which is how the rest of the kit walks a
    // row of buttons) move the highlight.
    case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown':
    case 'a': case 'A': case 'd': case 'D': case 'Tab':
      return { kind: 'focus', choice: focused === 'yes' ? 'no' : 'yes' };

    default: return { kind: 'ignore' };
  }
}
