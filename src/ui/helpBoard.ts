/**
 * The F1 controls menu's content and the arithmetic that fits it in its frame.
 *
 * Everything here is pure, and it lives apart from the drawing for the same
 * reason `arpBoard.ts` lives apart from `ArpView.ts`: the mistakes worth a test
 * are arithmetic, not pixels. This menu's copy is a page of text in two columns,
 * so its two real constraints are both numbers — how WIDE a row may be before it
 * runs into the next column, and how TALL a column may be before it runs out of
 * frame.
 *
 * The width constraint was known and guarded. The height one was not, and the
 * table grew a row at a time until the last eleven rows of it were drawn past the
 * bottom of the canvas — invisible, on the one screen whose entire job is to list
 * what exists. A menu that has outgrown its frame is not a mystery to catch by
 * eye; it is `helpContentHeight(HELP_COLUMNS) > VIEW.height`, which is a sum, and
 * a sum belongs in a file a test can call.
 */

/** A rectangle in the app's 720x405 design space, without needing Phaser. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One line of the menu: what you press, and what it does. */
export interface HelpRow {
  /** The key, click or button that acts. */
  keys: string;
  /** What it does. */
  action: string;
}

/** A titled run of rows. */
export interface HelpSection {
  title: string;
  rows: readonly HelpRow[];
}

/**
 * The menu frame, in canvas coordinates.
 *
 * It fills the screen because the menu is the only thing on it: 656 of the 720
 * across and 377 of the 405 down, with the light margin a modal needs to read as
 * something on top of the app rather than a second app.
 */
export const MODAL: Box = { x: 32, y: 14, width: 656, height: 377 };

/** Line spacing: 11px keeps 8px type legible without wasting the frame. */
export const LINE_H = 11;

/**
 * Extra air before a section title: one blank line.
 *
 * It is deliberately a LINE and not a tidy number of pixels. The columns are
 * read through a window ([`VIEW`]), and a person scrolls them by whole lines —
 * so every row has to sit on the same 11px lattice for the window to be able to
 * cut between two rows instead of through one. A gap of `6` put every section
 * after the first off that lattice, which is how a row could be shown with its
 * bottom half missing.
 */
export const SECTION_GAP = LINE_H;

/** The keys column inside a section, before its description starts. */
export const KEY_W = 128;

/** Distance between the two section columns. */
export const COL_W = 336;

/**
 * The frame's inner content rect, matching what a `Panel` would hand back.
 *
 * Exported because both columns are placed from it and the footer is written
 * along it: a second copy in the view would be a second answer to where the page
 * starts, which is the class of mistake this file exists to end.
 */
export const BODY: Box = {
  x: MODAL.x + 4,
  y: MODAL.y + 12 + 4,
  width: MODAL.width - 8,
  height: MODAL.height - 12 - 8,
};

/** Where the rule above the footer is drawn, and so where the copy must stop. */
export const FOOT_RULE_Y = MODAL.y + MODAL.height - 54;

/**
 * Where the copy starts: a 2px inset under the header rule, so the first
 * section title is not glued to it.
 */
export const TOP_INSET = 2;

/** The y of the first title drawn, and so of every row on the lattice. */
export const COPY_TOP = BODY.y + TOP_INSET;

/**
 * The window the two columns are read through: the body, down to the footer
 * rule.
 *
 * The footer is not part of the page being scrolled — it says how to leave, and
 * a reader who has scrolled to the bottom still needs it. So the copy scrolls
 * under a fixed floor rather than pushing the last three lines off the screen.
 */
export const VIEW: Box = {
  x: BODY.x,
  y: BODY.y,
  width: BODY.width,
  height: FOOT_RULE_Y - BODY.y,
};

/**
 * The menu's whole content, in reading order per column. Left column: how to
 * get around, write and script it. Right column: how to shape the song and the
 * channels.
 *
 * The two columns are meant to END TOGETHER — a reader who scrolls to the bottom
 * should run out of left column and right column at about the same moment, or
 * half the window is blank for the last scroll and the page reads as though
 * something failed to load. `SCRIPT` and `THE PAGES` therefore sit on the left,
 * where writing and navigation live, rather than under the menus on the right:
 * they are the lines the left column needs and the right column can spare, and
 * the gap between the two columns' heights is what a reader spends looking at
 * empty space at the end of the page.
 *
 * `THE PAGES` is here because the screen's promise is EVERY CONTROL and the page
 * system was the largest thing it did not mention: the dropdown is how a person
 * finds the arranger, the macro, the arpeggiator and the recorder, and none of
 * them appeared on the one page that lists what exists.
 */
export const HELP_COLUMNS: readonly (readonly HelpSection[])[] = [
  [
    {
      title: 'PLAYBACK',
      rows: [
        { keys: 'SPACE or ENTER', action: 'PLAY / STOP' },
        { keys: 'ESC', action: 'STOP' },
      ],
    },
    {
      title: 'MOVE THE CURSOR',
      rows: [
        { keys: 'ARROWS', action: 'MOVE UP / DOWN / LEFT / RIGHT' },
        { keys: 'PGUP / PGDN', action: 'PREVIOUS / NEXT PATTERN' },
        { keys: 'CLICK A CELL', action: 'PUT THE CURSOR THERE' },
        { keys: 'F8', action: 'GRID / DRUM LANES / PIANO ROLL' },
      ],
    },
    {
      title: 'WRITE NOTES',
      rows: [
        { keys: 'Z X C V B N M', action: 'LOWER OCTAVE, WHITE KEYS' },
        { keys: 'S D G H J', action: 'LOWER OCTAVE, BLACK KEYS' },
        { keys: 'Q W E R T Y U', action: 'UPPER OCTAVE, WHITE KEYS' },
        { keys: '2 3 5 6 7', action: 'UPPER OCTAVE, BLACK KEYS' },
        { keys: 'CLICK A PIANO KEY', action: 'WRITE A NOTE AT THE CURSOR' },
        { keys: '- / +', action: 'OCTAVE DOWN / UP' },
        { keys: '[ / ]', action: 'SOFTEN / ACCENT THE NOTE' },
        { keys: '> / *', action: 'A NOTE THAT SLIDES IN / STUTTERS' },
        { keys: 'BACKSPACE', action: 'CLEAR THE CELL' },
        { keys: 'RIGHT-CLICK', action: 'CLEAR THE CELL' },
      ],
    },
    {
      title: 'THE KEY',
      rows: [
        { keys: 'KEY  <  >', action: 'MOVE THE TONIC' },
        { keys: 'KEY SCALE', action: 'CYCLE THE FIVE SCALES' },
        { keys: 'THE PIANO', action: 'DIMS THE NOTES OUTSIDE IT' },
        { keys: 'CHORDS', action: 'OFF / TRIAD / 7TH - ONE KEY, A CHORD' },
      ],
    },
    {
      title: 'GAMEPAD',
      rows: [
        { keys: 'D-PAD or STICK', action: 'MOVE THE CURSOR' },
        { keys: 'A / B', action: 'PLAY / STOP' },
        { keys: 'LB / RB', action: 'PREVIOUS / NEXT PATTERN' },
      ],
    },
    {
      title: 'SCRIPT',
      rows: [
        { keys: 'SCRIPT BUTTON', action: 'WRITE MUSIC AS TEXT' },
        { keys: 'APPLY / CTRL+ENTER', action: 'REPLACE THE WHOLE SONG' },
        { keys: 'LOAD EXAMPLE', action: 'FILL THE BOX WITH A SONG' },
        { keys: 'MCP BUTTON', action: 'LET AN AGENT WRITE THIS' },
      ],
    },
    {
      title: 'THE PAGES',
      rows: [
        { keys: 'PAGE  <  >', action: 'TRACKER, ARRANGER, MIXER, LIVE' },
        { keys: 'THEN  <  >', action: 'THE MACRO, ARP AND RECORDER PAGES' },
        { keys: 'EVERY PAGE', action: 'HAS ITS OWN LINE OF KEYS AT THE FOOT' },
      ],
    },
  ],
  [
    {
      title: 'THE MENUS',
      rows: [
        { keys: 'F1', action: 'THIS SCREEN - EVERY CONTROL' },
        { keys: 'F2', action: 'FILE - NEW, OPEN, SAVE, EXPORT' },
        { keys: 'F3', action: 'SONG - THE BARS IT PLAYS' },
        { keys: 'F4', action: 'SOUND - VOICES, KNOBS, SAVE AS' },
        { keys: 'F5', action: 'THE MIXER - EVERY CHANNEL AT ONCE' },
        { keys: 'F5 AGAIN', action: 'BACK TO THE TRACKER' },
        { keys: 'F6', action: 'INSTRUMENTS - WHAT IT CAN SOUND LIKE' },
        { keys: 'F7', action: 'DESIGN - LAYERS AND EFFECTS' },
        { keys: 'F9', action: 'APPEARANCE - THEME AND TEXT SIZE' },
        { keys: 'F10', action: 'HISTORY - THE STEPS YOU TOOK' },
        { keys: 'ARROWS / ENTER', action: 'BROWSE A MENU, THEN PICK IT' },
      ],
    },
    {
      title: 'CHANNELS',
      rows: [
        { keys: 'CLICK / SHIFT+CLICK', action: 'SELECT IT / RENAME IT' },
        { keys: 'HOLD: 1..16', action: 'HOW LONG ITS NOTES RING' },
        { keys: 'F4 / CLICK CHIP', action: 'CHANGE THE CHANNEL SOUND' },
        { keys: 'F7', action: 'STACK LAYERS UNDER ITS SOUND' },
        { keys: 'F7 THEN TAB', action: 'THE EFFECTS ON THIS CHANNEL' },
        { keys: 'A +2 ON THE ROW', action: 'THIS CHANNEL HAS LAYERS - SEE F7' },
        { keys: 'F8 + CLICK', action: 'HIT A DRUM OR WRITE A ROLL NOTE' },
        { keys: 'F5', action: 'ITS LEVEL, PAN, SENDS, DUCK, FX' },
        { keys: 'CLICK THE BOX', action: 'MUTE / UNMUTE IT' },
        { keys: 'F5 THEN O', action: 'HEAR ONLY THIS CHANNEL' },
        { keys: 'F5 THEN TAB', action: 'THE CHANNEL FX PAGES' },
        { keys: 'F5 THEN B', action: 'PLAY THE OTHER BALANCE - A/B' },
        { keys: 'F5 THEN CTRL+C', action: 'COPY THAT CHANNEL\u2019S MIX' },
        { keys: 'F5 THEN CTRL+V', action: 'PASTE IT ONTO ANOTHER' },
        { keys: 'F5, THEN ROOM', action: 'HOW BIG THE ROOM IS' },
        { keys: '+ ADD / - DEL', action: 'ADD OR REMOVE A CHANNEL' },
      ],
    },
    {
      title: 'THE SONG',
      rows: [
        { keys: 'F3 SONG ORDER', action: 'WHICH BARS PLAY, AND WHEN' },
        { keys: 'SHIFT+CLICK TITLE', action: 'RENAME THE SONG' },
        { keys: 'CTRL+Z', action: 'UNDO' },
        { keys: 'CTRL+SHIFT+Z / CTRL+Y', action: 'REDO' },
        { keys: 'TEMPO / VOLUME / SWING', action: 'SLIDERS IN THE TRANSPORT' },
        { keys: 'GROOVE', action: 'THE FEEL IT IS PLAYED WITH' },
        { keys: 'CLEAR PATTERN', action: 'EMPTY THIS PATTERN' },
        { keys: 'HEAR NOTES AS I MOVE', action: 'AUDITION AS YOU NAVIGATE' },
      ],
    },
  ],
];

/**
 * How many pixels tall a column is, from its own sections.
 *
 * A title, its rows, and one blank line after each — the whole page is lines of
 * [`LINE_H`], which is what lets the window cut between rows rather than through
 * them.
 */
export function helpColumnHeight(sections: readonly HelpSection[]): number {
  let height = 0;
  for (const section of sections) {
    // The title, its rows, then the air before the next section — the gap is
    // counted rather than assumed to be a line, so a future gap that is two
    // lines tall is measured as two lines.
    height += (1 + section.rows.length) * LINE_H + SECTION_GAP;
  }
  return height;
}

/**
 * How many line slots a column occupies.
 *
 * Only meaningful while [`SECTION_GAP`] is a whole number of lines, which is the
 * assumption the window's "rows whole, never cut" promise is built on and which a
 * guard in `helpOverlay.test.ts` holds. Every slot is [`LINE_H`] tall, starting at
 * [`COPY_TOP`].
 */
export function helpColumnLines(sections: readonly HelpSection[]): number {
  let lines = 0;
  for (const section of sections) lines += 1 + section.rows.length + SECTION_GAP / LINE_H;
  return lines;
}

/** The tallest column, which is the one the window has to be able to reach past. */
export function helpContentHeight(columns: readonly (readonly HelpSection[])[]): number {
  let tallest = 0;
  for (const column of columns) tallest = Math.max(tallest, helpColumnHeight(column));
  return tallest;
}

/**
 * The furthest the columns may scroll, in whole lines.
 *
 * Rounded UP to a line, and that direction is the whole of it. Rounding DOWN
 * looks like the careful choice — it never scrolls past the end — but it leaves
 * the last row short of the window by however many pixels were rounded away, and
 * a row that cannot be brought into view is a row nobody can read. Rounding up
 * costs at most one blank line under the end of the copy; rounding down loses
 * the end of the page. A menu that fits returns `0`, which is what tells the
 * page it needs no bar and no hint.
 */
export function helpScrollLimit(columns: readonly (readonly HelpSection[])[]): number {
  // The window has `TOP_INSET` pixels of blank air at its top before the first
  // row, so that much of it cannot be spent on content.
  const room = VIEW.height - TOP_INSET;
  const over = helpContentHeight(columns) - room;
  return over <= 0 ? 0 : Math.ceil(over / LINE_H) * LINE_H;
}

/**
 * One step of scrolling — a wheel notch, an arrow, a page — kept on the lattice
 * and inside the range.
 *
 * `lines` is how many lines to move, so a page is a line count rather than a
 * pixel count and the two can never disagree about where a row may stop.
 */
export function helpScrollBy(scroll: number, lines: number, limit: number): number {
  const stepped = (Math.round(scroll / LINE_H) + lines) * LINE_H;
  return Math.max(0, Math.min(limit, stepped));
}

/** How many whole lines fit in the window — what one PAGE of scrolling is. */
export function helpPageLines(): number {
  return Math.floor(VIEW.height / LINE_H);
}

/**
 * Whether a row at `y` is inside the window at `scroll`, with the scroll kept on
 * the lattice so this is a whole-row yes or no rather than a partial draw.
 */
export function helpRowInView(y: number, scroll: number): boolean {
  const top = y - scroll;
  return top >= VIEW.y - 0.5 && top + LINE_H <= VIEW.y + VIEW.height + 0.5;
}
