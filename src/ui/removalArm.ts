/**
 * removalArm — the two-press `DEL` behind the F2 instrument list, as DATA.
 *
 * `FileMenu.ts` owns the frame, the highlight and the file pickers; this file
 * owns the one DECISION it makes, because that decision is the only irreversible
 * thing in any of the menus and it is easier to be sure of when it is a function
 * of two values rather than a field somebody reads three places apart.
 *
 * ── Why two presses, when every other menu here acts on one ──────────────────
 * A song edit is guarded by `Ctrl+Z`, and this codebase leans on that: `NEW SONG`
 * sits behind no confirmation because the undo history IS the confirmation. An
 * imported instrument is app state, not a song edit, so it has no undo step to
 * lean on — and a soundfont may be a download from an hour ago that you would
 * have to find all over again. So the guard has to be in the gesture.
 *
 * ── The rule the whole file exists to make checkable ────────────────────────
 * The second press removes the row the FIRST press was about, never the row you
 * happen to be on now. Arm one instrument, arrow to another, and `DEL` arms the
 * new one rather than deleting the one you armed and walked away from; leaving
 * the chooser at all drops the arm. A confirmation that follows the highlight
 * around is not a confirmation, it is a delayed accident.
 *
 * Phaser-free, so the property above is checked by a test rather than by a
 * person remembering to press the right keys in the right order.
 */

/** The instrument a first `DEL` has marked, waiting for a second one. */
export interface RemovalArm {
  /** The id of the row waiting for its second `DEL`, or `''` for no arm. */
  id: string;
}

/** Nothing armed: what the chooser starts in, and what any move returns to. */
export const NO_ARM: RemovalArm = { id: '' };

/** What one `DEL` means, given what was armed and what is highlighted. */
export type RemovalStep =
  /** Nothing highlightable under the cursor (the empty list's own rows). */
  | { kind: 'none'; arm: RemovalArm }
  /** First press on this row, or a press on a DIFFERENT row: say what it will do. */
  | { kind: 'arm'; id: string; arm: RemovalArm }
  /** Second press on the row that was armed: this is the one to take out. */
  | { kind: 'remove'; id: string; arm: RemovalArm };

/**
 * One press of `DEL`.
 *
 * `highlighted` is the id under the cursor, or `null` when the cursor is on
 * something that is not an instrument — the chooser's own "nothing imported yet"
 * row, or the way back. A row that cannot be removed cannot be armed either, so
 * a press there clears what was armed rather than leaving it primed behind a
 * highlight that is no longer on it.
 */
export function stepRemoval(arm: RemovalArm, highlighted: string | null): RemovalStep {
  if (highlighted === null) return { kind: 'none', arm: NO_ARM };
  if (arm.id !== highlighted) return { kind: 'arm', id: highlighted, arm: { id: highlighted } };
  return { kind: 'remove', id: highlighted, arm: NO_ARM };
}
