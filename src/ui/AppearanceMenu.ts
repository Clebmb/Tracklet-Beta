import type Phaser from 'phaser';
import {
  activeColors,
  activeTheme,
  applyThemeRow,
  buildView,
  Button,
  drawDivider,
  drawPanel,
  intToCss,
  MenuListPanel,
  moveCursor,
  onThemeChanged,
  THEMES,
  themeById,
  themeIdFromRow,
  themeMenuRows,
  uiText,
  type MenuRow,
  type MenuView,
  type Rect,
} from 'phaser-ui-canvas';

import { contrastReading, type ContrastGrade } from './contrast';
import { menuIntent } from './menuKeys';
import { activeTextScale, textScaleAbout, textScaleLabel, type TextScale } from './textScale';

/**
 * AppearanceMenu — the F9 menu: which of the framework's looks the app wears.
 *
 * Tracklet draws every pixel of its own chrome from the ACTIVE THEME's palette
 * — panels, text, the pattern grid, the piano, the playhead, each channel's
 * colour — so "theme" is not a tint here, it is the whole surface. That makes it
 * worth a menu, and it makes the menu unusually easy, because the framework
 * ships both halves of this feature: the ten themes (`THEMES`) and the rows that
 * pick between them (`themeMenuRows` / `applyThemeRow`). This file is the modal
 * around those two calls, plus the one thing the framework cannot supply — a
 * picture of what you are about to choose.
 *
 * Three decisions shape it.
 *
 * 1. THE LIST IS THE FRAMEWORK'S, NOT A HAND-DRAWN ONE.
 *
 *    `MenuListPanel` already draws a titled list with a cursor band, gutter
 *    swatches, a checkmark on the current row, hover and click zones, and a
 *    cursor layer that can move without rebuilding the hit-regions. The cursor
 *    arithmetic (`moveCursor`) and the row model are shared with the framework's
 *    own menus, so this menu behaves like the rest of the family and stays that
 *    way as the family changes. Tracklet supplies the rows (one per theme, each
 *    with its accent colour as a swatch) and the frame around them.
 *
 * 2. THE PREVIEW IS DRAWN IN THE HIGHLIGHTED THEME'S OWN COLOURS.
 *
 *    A list of ten names asks the user to remember what "MYCELIUM" looked like.
 *    So a mini panel is drawn with `drawPanel(g, rect, 1, highlighted.colors)` —
 *    the same painter the app uses, handed an explicit palette, which is exactly
 *    what that parameter is for — and filled with the palette's parts in use: a
 *    wordmark, a grid row on the edit cursor's ward wash, a channel swatch, a
 *    dim label and a green status. The frame and the trim are drawn in the
 *    theme's own stone and ward, so the preview is honest about the two things a
 *    list of colours would hide.
 *
 * 3. IT BROWSES LIKE A PICKER, NOT LIKE A LIST.
 *
 *    The highlight WRAPS: Down from the last theme is the first, and Up from the
 *    first is the last, because a set of ten looks you are comparing is a cycle
 *    and a cursor that jams at the bottom makes you go back the way you came.
 *    Up/Down and Left/Right both step (the framework's own convention for
 *    changing a value is Left/Right), Home and End jump, and Enter or Space
 *    applies. It also OPENS on the theme that is on, so the first thing the menu
 *    tells you is where you are rather than where you last browsed to.
 *
 * 4. THE PREVIEW CARRIES ITS OWN CONTRAST READING.
 *
 *    A palette you can look at is not the same as a palette you can read, and
 *    the difference is exactly the thing a list of ten looks hides: the one
 *    theme here that is dark-on-light, and the two or three whose dim text is
 *    tight. So the menu measures the highlighted theme's primary text against
 *    its own panel and prints the WCAG ratio beside the grade — `13.5:1  AAA` —
 *    with the grade in the accent colour, the way every other live value in the
 *    app is drawn. Nothing is refused: every one of these shipped as somebody's
 *    look, and the number belongs where the choice is made, not behind a lock.
 *
 * 5. THE OTHER HALF OF "APPEARANCE" IS HOW BIG THE TEXT IS.
 *
 *    A second button under CLOSE cycles the app's text size, and `Tab` does the
 *    same from the keyboard, because a size you cannot change from the keyboard
 *    is a size the menus cannot teach. What it changes is the app's DOM TEXT
 *    BOXES — the script editor and the name box — and the button says so in its
 *    own status line rather than promising more: the canvas chrome already
 *    follows your window, and the app does not pretend a fixed-layout canvas can
 *    be re-laid out by a menu item.
 *
 * 6. CHOOSING APPLIES IMMEDIATELY; THERE IS NO OK BUTTON.
 *
 *    `setActiveTheme` is the framework's single writer and every view in the app
 *    hears about it, so the switch is live and complete. The alternative — a
 *    preview that lies until you confirm — is more code and less truth. The only
 *    thing the menu adds on top is remembering the choice, which it hands to the
 *    scene through `onThemeApplied` rather than doing itself: where a preference
 *    is kept is the app's business, not a view's.
 */

export interface AppearanceMenuHandlers {
  /** The menu opened or closed, so the scene can pause its own input. */
  onOpenChange?: (open: boolean) => void;
  /** A theme was applied (the framework has already switched). Remember it. */
  onThemeApplied?: (id: string) => void;
  /**
   * Advance the text size. The SCENE owns the advance (it sets the live value
   * and remembers it); this answers with the size it landed on, so the button
   * and its status line can say where you are.
   */
  onCycleTextScale?: () => TextScale;
}

/** The canvas the app is drawn in. */
const CANVAS_W = 720;
const CANVAS_H = 405;

/** The modal frame, in canvas coordinates. */
const MODAL: Rect = { x: 90, y: 67, width: 540, height: 250 };
/** The theme list, and the live preview beside it. */
const LIST: Rect = { x: 94, y: 85, width: 252, height: 116 };
const PREVIEW: Rect = { x: 358, y: 85, width: 268, height: 62 };

/**
 * Where the contrast reading sits: the modal's last line, beside CLOSE, which is
 * the one row nothing else wraps into.
 */
const CONTRAST_Y = MODAL.y + MODAL.height - 26;

/** Where the text-size button sits — beside CLOSE, on the modal's last row. */
const TEXT_BUTTON: Rect = { x: 402, y: CONTRAST_Y, width: 100, height: 20 };

/**
 * The line that explains the text size. It lives between the theme paragraph and
 * the key hints, which is the one gap in the modal that nothing wraps into.
 */
const TEXT_SIZE_Y = 238;

/** Where the list's first row sits, and the row pitch the 8px labels want. */
const LIST_TOP = 3;
const ROW_H = 11;
/** The tightest pitch still worth drawing, if the framework ships many themes. */
const ROW_H_MIN = 8;

/** Render depths: dim < curtain < frame < list + preview art < text and buttons. */
const DEPTH_DIM = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 968;
const DEPTH_PANEL = 974;
const DEPTH_FRONT = 980;

/** Which theme colour a piece of copy wears, so a recolour can find it. */
type TextRole = 'heading' | 'body' | 'accent' | 'dim';

interface Copy {
  obj: Phaser.GameObjects.Text;
  role: TextRole;
}

export class AppearanceMenu {
  private readonly scene: Phaser.Scene;
  private readonly handlers: AppearanceMenuHandlers;

  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly previewGfx: Phaser.GameObjects.Graphics;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly list: MenuListPanel;
  private readonly closeButton: Button;
  /** Cycles the app's text size; its own label says which size is on. */
  private readonly textButton: Button;
  /** The status line under the description: which size, and what it does. */
  private readonly textSizeCopy: Phaser.GameObjects.Text;
  private readonly copy: Copy[] = [];

  /** The preview's own lines: the only text coloured by a NON-active theme. */
  private readonly previewName: Phaser.GameObjects.Text;
  private readonly previewRow: Phaser.GameObjects.Text;
  private readonly previewDim: Phaser.GameObjects.Text;
  private readonly previewStatus: Phaser.GameObjects.Text;

  private readonly note: Phaser.GameObjects.Text;
  /** The highlighted theme's text-against-panel contrast, as a number and a grade. */
  private readonly contrast: Phaser.GameObjects.Text;
  private opened = false;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, handlers: AppearanceMenuHandlers = {}) {
    this.scene = scene;
    this.handlers = handlers;

    // A row is a theme; activating one applies it, and hovering one describes
    // it, so the preview always belongs to whatever the pointer or keys are on.
    this.list = new MenuListPanel(scene, LIST, this.menuView(), {
      onActivate: (_row: MenuRow, index: number) => {
        this.focus(index);
        this.applyHighlighted();
      },
      onHover: (index: number | null) => {
        if (index !== null) this.focus(index);
      },
    }, { rowH: rowPitch(), top: LIST_TOP, padX: 4, valueRight: 8 });
    this.list.container.setDepth(DEPTH_PANEL);

    this.dim = scene.add.graphics().setDepth(DEPTH_DIM);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);
    this.previewGfx = scene.add.graphics().setDepth(DEPTH_PANEL);

    // A full-screen zone in front of the app, so a stray click under the menu
    // cannot edit the song. It also dismisses the menu, because a modal you
    // cannot leave by clicking is worse than no modal.
    this.curtain = scene.add.zone(0, 0, CANVAS_W, CANVAS_H).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);
    this.curtain.on('pointerdown', () => this.hide());

    this.addCopy(MODAL.x + 4, MODAL.y + 2, 'APPEARANCE  -  THE LOOK OF THE WHOLE APP', 'accent');
    this.addCopy(PREVIEW.x, PREVIEW.y + PREVIEW.height + 6, 'WHAT IT LOOKS LIKE', 'dim');
    this.addCopy(MODAL.x + 4, MODAL.y + MODAL.height - 46, 'ARROWS/WASD BROWSE  ·  ENTER APPLIES  ·  ESC CLOSES  ·  TAB TEXT SIZE', 'dim');
    this.addCopy(MODAL.x + 4, 212,
      'EVERY COLOUR THE APP DRAWS COMES FROM THE THEME, SO A SWITCH CHANGES ALL OF IT AT ONCE. YOUR CHOICE IS REMEMBERED FOR NEXT TIME.',
      'dim');

    // The preview's mock content: a heading, a grid row, a dim label and a live
    // status — one piece of the app per colour the palette has an opinion about.
    this.previewName = this.makeText(PREVIEW.x + 4, PREVIEW.y + 4, 'RELIQUARY', 10);
    this.previewRow = this.makeText(PREVIEW.x + 4, PREVIEW.y + 19, 'A-4  A-2  E-4  C-6', 8);
    this.previewDim = this.makeText(PREVIEW.x + 4, PREVIEW.y + 33, 'STEP 00  ·  4 TRACKS', 8);
    this.previewStatus = this.makeText(PREVIEW.x + 22, PREVIEW.y + 47, 'PLAYING', 8);

    this.note = uiText(scene, PREVIEW.x, PREVIEW.y + PREVIEW.height + 20, '', {
      size: 8, color: activeColors().textDim, wordWrapWidth: PREVIEW.width,
    });
    this.note.setDepth(DEPTH_FRONT);

    this.textSizeCopy = this.addCopy(MODAL.x + 4, TEXT_SIZE_Y, '', 'dim');

    // On the modal's last row, left of CLOSE, which is the only copy that row has
    // to share: the text-size button and CLOSE are the modal's two actions.
    this.contrast = uiText(scene, MODAL.x + 4, CONTRAST_Y, '', {
      size: 8, color: activeColors().textGreen,
      // Narrow enough to leave the text button its own room on that row.
      wordWrapWidth: TEXT_BUTTON.x - MODAL.x - 12,
    });
    this.contrast.setDepth(DEPTH_FRONT);

    this.closeButton = new Button(scene, {
      x: MODAL.x + MODAL.width - 122,
      y: MODAL.y + MODAL.height - 26,
      width: 116,
      height: 20,
    }, 'CLOSE', { size: 8, icon: 'close' });
    this.closeButton.container.setDepth(DEPTH_FRONT);
    this.closeButton.onPress = () => this.hide();

    this.textButton = new Button(scene, TEXT_BUTTON, 'TEXT NORMAL', { size: 8 });
    this.textButton.container.setDepth(DEPTH_FRONT);
    this.textButton.onPress = () => this.cycleTextScale();
    this.describeTextScale();

    this.unsubscribe = onThemeChanged(() => this.render());
    this.setOpen(false);
    this.render();
  }

  /** True while the menu is up; the scene pauses itself while it is. */
  get isOpen(): boolean {
    return this.opened;
  }

  /** The theme the highlighted row would apply. */
  get highlightedId(): string {
    const row = this.list.rows[this.list.cursor];
    return (row ? themeIdFromRow(row) : null) ?? activeTheme().id;
  }

  show(): void { this.setOpen(true); }
  hide(): void { this.setOpen(false); }
  toggle(): void { this.setOpen(!this.opened); }

  /**
   * A key while the menu is up. The scene routes here BEFORE its own bindings, so
   * the arrows (or `W A S D`, which are piano keys the rest of the time) walk the
   * themes instead of the pattern cursor behind the curtain, and Space applies a
   * theme instead of starting playback. The keys themselves are `menuIntent`s.
   */
  handleKey(event: KeyboardEvent): void {
    // `Tab` is the text size, and it is read BEFORE the menu's own keys because
    // no `menuIntent` claims it — the same reason `Ctrl+Z` is read before the menu
    // in the scene.
    if (event.code === 'Tab') {
      event.preventDefault();
      this.cycleTextScale();
      return;
    }
    const intent = menuIntent(event.code);
    if (intent === null) return;
    event.preventDefault();
    switch (intent) {
      case 'up':
        this.step(-1);
        return;
      case 'down':
        this.step(1);
        return;
      case 'first':
        this.focus(0);
        return;
      case 'last':
        this.focus(this.list.rows.length - 1);
        return;
      case 'pick':
        this.applyHighlighted();
        return;
      case 'close':
        this.hide();
        return;
    }
  }

  destroy(): void {
    this.unsubscribe();
    this.list.destroy();
    this.closeButton.destroy();
    this.textButton.destroy();
    for (const entry of this.copy) entry.obj.destroy();
    this.note.destroy();
    this.contrast.destroy();
    this.previewName.destroy();
    this.previewRow.destroy();
    this.previewDim.destroy();
    this.previewStatus.destroy();
    this.curtain.destroy();
    this.dim.destroy();
    this.frame.destroy();
    this.previewGfx.destroy();
  }

  // --- open/close plumbing --------------------------------------------------

  private setOpen(open: boolean): void {
    // Only report a CHANGE: the constructor closes once to reach a known state,
    // and the scene would otherwise hear "closed" before its input exists.
    const changed = open !== this.opened;
    this.opened = open;
    this.dim.setVisible(open);
    this.frame.setVisible(open);
    this.previewGfx.setVisible(open);
    this.curtain.setVisible(open);
    this.list.container.setVisible(open);
    this.closeButton.container.setVisible(open);
    this.textButton.container.setVisible(open);
    for (const entry of this.copy) entry.obj.setVisible(open);
    this.note.setVisible(open);
    this.contrast.setVisible(open);
    for (const text of [this.previewName, this.previewRow, this.previewDim, this.previewStatus]) {
      text.setVisible(open);
    }
    // Open on what is ON. The first question a theme menu has to answer is
    // "which one am I using", and leaving the highlight wherever the last visit
    // left it makes the preview look like a lie about the current theme.
    if (changed && open) this.focus(this.activeRow());
    if (changed) this.handlers.onOpenChange?.(open);
  }

  // --- choosing -------------------------------------------------------------

  /**
   * Move the highlight one row, WRAPPING at both ends.
   *
   * `moveCursor` is the framework's own stepping and it stops at the ends, which
   * is right for a settings list you scroll to an edge and leave. A theme picker
   * is a set of looks you are comparing, so it cycles: Down from the last theme
   * is the first. The wrap is done here rather than by reimplementing the
   * stepping, so a header or a disabled row would still be skipped the same way
   * the framework skips it — the only difference is what happens at the edge, and
   * the only way to detect the edge is that the cursor did not move.
   */
  private step(delta: number): void {
    const rows = this.list.rows;
    if (rows.length === 0) return;
    const next = moveCursor(rows, this.list.cursor, delta);
    this.focus(next === this.list.cursor ? (delta > 0 ? 0 : rows.length - 1) : next);
  }

  private focus(index: number): void {
    if (index < 0) return;
    if (index !== this.list.cursor) this.list.setCursor(index);
    this.describe();
  }

  /**
   * Advance the text size through the scene, then say where it landed. The scene
   * is the writer because remembering a preference is the app's business, not a
   * view's — and it answers with the new size so the button can be its own
   * read-out, which is the only feedback visible above this modal's curtain.
   */
  private cycleTextScale(): void {
    this.handlers.onCycleTextScale?.();
    this.describeTextScale();
  }

  /** The text-size button's label and its one-line explanation. */
  private describeTextScale(): void {
    const size = activeTextScale();
    this.textButton.setText(`TEXT ${textScaleLabel(size)}`);
    this.textSizeCopy.setText(
      `TEXT SIZE ${textScaleLabel(size)}  -  ${textScaleAbout(size)}. THE CANVAS ALREADY FOLLOWS YOUR WINDOW; THIS IS THE TEXT BOXES.`,
    );
  }

  /** The row of the theme the app is wearing, so the menu can open on it. */
  private activeRow(): number {
    const id = activeTheme().id;
    const index = this.list.rows.findIndex((row) => themeIdFromRow(row) === id);
    return index < 0 ? 0 : index;
  }

  /**
   * Apply whatever is highlighted. `applyThemeRow` reports whether anything
   * moved, so landing on the theme that is already on is not an "apply".
   */
  private applyHighlighted(): void {
    const row = this.list.rows[this.list.cursor];
    if (!row) return;
    if (!applyThemeRow(row)) return;
    this.handlers.onThemeApplied?.(this.highlightedId);
  }

  /**
   * The rows: one per theme, each wearing its own accent as a gutter swatch.
   * Reads the list's cursor, which is safe to do before the list exists because
   * the constructor builds the first view with no cursor yet.
   */
  private menuView(cursor = this.list?.cursor ?? 0): MenuView {
    const rows: MenuRow[] = themeMenuRows(activeTheme().id).map((row) => {
      const id = themeIdFromRow(row);
      return id ? { ...row, swatch: themeById(id).colors.ooze } : row;
    });
    return buildView('', rows, Math.max(0, cursor));
  }

  // --- drawing --------------------------------------------------------------

  private makeText(x: number, y: number, text: string, size: number): Phaser.GameObjects.Text {
    const obj = uiText(this.scene, x, y, text, { size, color: activeColors().textPrimary });
    obj.setDepth(DEPTH_FRONT);
    return obj;
  }

  private addCopy(x: number, y: number, text: string, role: TextRole): Phaser.GameObjects.Text {
    const obj = uiText(this.scene, x, y, text, {
      size: 8, color: activeColors().textPrimary, wordWrapWidth: MODAL.width - 8,
    });
    obj.setDepth(DEPTH_FRONT);
    this.copy.push({ obj, role });
    return obj;
  }

  /** Point the note and the preview at whatever row is highlighted. */
  private describe(): void {
    const theme = themeById(this.highlightedId);
    this.note.setText(theme.note);
    const reading = contrastReading(theme.colors.textPrimary, theme.colors.panelFill);
    this.contrast.setText(`TEXT ${reading.label}  \u00b7  ${reading.blurb}`);
    this.contrast.setColor(intToCss(gradeColor(reading.grade)));
    this.drawPreview(theme.id);
  }

  /**
   * Draw the mini panel in the HIGHLIGHTED theme's palette — the one place in
   * the app where a palette other than the active one is used, and the reason
   * the framework's painters take one as an argument.
   */
  private drawPreview(id: string): void {
    const colors = themeById(id).colors;
    const g = this.previewGfx;
    g.clear();
    drawPanel(g, PREVIEW, 1, colors);
    // The edit cursor's ward wash, over the grid row.
    g.fillStyle(colors.ward, 0.22);
    g.fillRect(PREVIEW.x + 3, PREVIEW.y + 17, PREVIEW.width - 6, 11);
    g.fillStyle(colors.ward, 0.9);
    g.fillRect(PREVIEW.x + 3, PREVIEW.y + 17, 1, 11);
    // A channel swatch: the ink outline the app puts round every chip.
    g.fillStyle(colors.ink, 1);
    g.fillRect(PREVIEW.x + 6, PREVIEW.y + 46, 8, 8);
    g.fillStyle(colors.ooze, 1);
    g.fillRect(PREVIEW.x + 7, PREVIEW.y + 47, 6, 6);

    this.previewName.setText(themeById(id).name).setColor(intToCss(colors.wordmark));
    this.previewRow.setColor(intToCss(colors.textPrimary));
    this.previewDim.setColor(intToCss(colors.textDim));
    this.previewStatus.setColor(intToCss(colors.textGreen));
  }

  render(): void {
    const c = activeColors();
    const theme = activeTheme();

    this.dim.clear();
    this.dim.fillStyle(c.ink, 0.8);
    this.dim.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const frame = this.frame;
    frame.clear();
    drawPanel(frame, MODAL, 1, c);
    drawDivider(frame, MODAL.x + 2, MODAL.y + 12, MODAL.width - 4, 1, c);
    drawDivider(frame, MODAL.x + 2, 206, MODAL.width - 4, 1, c);

    const roleColor: Record<TextRole, number> = {
      heading: c.textDim,
      body: c.textPrimary,
      accent: theme.colors.ooze,
      dim: c.textDim,
    };
    for (const entry of this.copy) entry.obj.setColor(intToCss(roleColor[entry.role]));
    this.note.setColor(intToCss(c.textPrimary));

    // The list also carries the "which one is on" mark, so it is rebuilt after
    // a switch — with the cursor put back where it was.
    this.list.setView(this.menuView());
    this.describe();
  }
}

/**
 * The row pitch: eleven pixels, which is what the framework's eight-pixel labels
 * want, or less when the theme list has grown past what the panel is tall.
 * Compressing is the whole response, because a list drawn past its frame is a
 * list with rows nobody can click; the honest answer to many more themes is a
 * scrolling list inside the framework's `MenuListPanel`, not a narrower gap here.
 */
function rowPitch(count: number = THEMES.length): number {
  const fits = Math.floor((LIST.height - LIST_TOP) / Math.max(1, count));
  return Math.max(ROW_H_MIN, Math.min(ROW_H, fits));
}

/**
 * The colour a contrast grade wears: the palette's own accent for good news, its
 * ward for a pair that is only comfortable large, and its danger red for one
 * below every published bar. Read at draw time, so the reading recolours with the
 * theme like the rest of the modal.
 */
function gradeColor(grade: ContrastGrade): number {
  const c = activeColors();
  if (grade === 'AAA' || grade === 'AA') return c.textGreen;
  if (grade === 'AA-LARGE') return c.ward;
  return c.danger;
}
