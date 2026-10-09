import type Phaser from 'phaser';
import {
  activeColors,
  drawInset,
  drawPanel,
  intToCss,
  mix,
  onThemeChanged,
  uiPx,
  uiText,
  type Rect,
  type UiColors,
} from 'phaser-ui-canvas';

import type { Song } from '../model/song';
import { voiceNameFor } from '../model/voice';
import { MAX_SCENES, sceneNameProblem, tidySceneName } from '../model/scenes';
import { machineBarRows } from '../model/machine';
import {
  cellText,
  clampLiveCursor,
  clipPreview,
  cycleClip,
  cycleMachineBar,
  isMachineColumn,
  LIVE_QUANTIZE_CHOICES,
  liveColumnCount,
  machineBarLabel,
  moveLiveCursor,
  nextQuantize,
  patternStepCount,
  quantizeLabel,
  sceneCells,
  type LiveCursor,
} from './liveGrid';
import { RenameBox } from './RenameBox';
import { trackColor } from './trackColor';

/**
 * LiveView — the LIVE page, the app's performance surface.
 *
 * ── The shape ────────────────────────────────────────────────────────────────
 * A status line across the top (`PLAYING` / `QUEUED` and a countdown to the next
 * launch), the launch GRID on the left — one row per scene, one column per channel
 * — the INSPECTOR on the right (the selected clip and the selected scene), and a
 * quantize strip along the bottom. The shared transport bar under the page is the
 * ONE transport and is never redrawn here.
 *
 * ── Two modes, because a launch and an edit are different things ─────────────
 * PERFORM is the default: the grid launches scenes and nothing can change the
 * song. EDIT is entered deliberately; then the clip pads can be cycled and set
 * silent. Every scene edit is ONE undo step per gesture (the scene banks it), and
 * a LAUNCH costs none at all — it is a performance, like `solo`, and never travels
 * in a file.
 *
 * ── It holds no song ────────────────────────────────────────────────────────
 * Every number comes back from the scene on each paint and every edit goes back
 * through it, so the page cannot show a stale song. The cursor, the mode, the
 * hover and the status line are the page's own view state; the scene name is the
 * one text the page owns, and it commits through a real DOM `<input>` (the same
 * `RenameBox` a channel and the song use).
 */

/** Which mode the page is in: performing, or editing the grid. */
export type LiveMode = 'perform' | 'edit';

/** The per-step performance state the status line and the outlines read. */
export interface LiveState {
  /** The scene performing now, or null when the order is playing. */
  playing: number | null;
  /** The scene queued to take over at the next boundary, or null. */
  queued: number | null;
  /** How far through the performing scene's bar we are, 0..1. */
  progress: number;
  /** The countdown to the next launch, in beats, or null for quantize `NOW`. */
  countdown: { elapsed: number; total: number } | null;
}

export interface LiveHandlers {
  onOpenChange?: (open: boolean) => void;
  song: () => Song;
  /** The scene performing now, or null. */
  activeScene: () => number | null;
  /** The scene queued now, or null. */
  pendingScene: () => number | null;
  /** How far through the performing bar we are, 0..1. */
  progress: () => number;
  /** The countdown to the next launch, in beats. */
  countdown: () => { elapsed: number; total: number } | null;
  quantize: () => number;
  mode: () => LiveMode;
  setMode: (mode: LiveMode) => void;
  selectedChannel: () => number;
  select: (index: number) => void;
  /** Queue a scene to launch. False when the song has no such scene. */
  launch: (index: number) => boolean;
  /** Queue STOP ALL: back to the song's own order at the next boundary. */
  stopAll: () => void;
  setQuantize: (bars: number) => void;
  /** Bank ONE undo step, called at the start of an edit gesture. */
  beginEdit: () => void;
  /** Replace one cell's clip. The scene banks the undo step. */
  setClip: (scene: number, channel: number, clip: number | null) => void;
  addScene: () => void;
  renameScene: (index: number, name: string) => void;
  duplicateScene: (index: number) => void;
  deleteScene: (index: number) => void;
  /** Sound the selected cell's clip on its channel, so a cell can be heard. */
  audition: (scene: number, channel: number) => void;
  /** The page opened a DOM text box, so the scene must keep quiet. */
  setTextEditing: (editing: boolean) => void;
  /** Open the script modal, so the master-script workflow is one click away. */
  openScript: () => void;
  close: () => void;
}

/** The canvas the app is drawn in, and the page's own bounds (above the transport). */
const CANVAS_W = 720;
const PAGE_TOP = 39;
const PAGE_BOTTOM = 341;

/** The four framed areas: the status line, the grid, the inspector, the strip. */
const STATUS: Rect = { x: 8, y: 41, width: 704, height: 17 };
const MAIN: Rect = { x: 8, y: 60, width: 494, height: 214 };
const INSPECTOR: Rect = { x: 506, y: 60, width: 206, height: 214 };
const STRIP: Rect = { x: 8, y: 277, width: 704, height: 30 };

/** The grid's own geometry. */
const HEAD_Y = MAIN.y + 3;
const HEAD_H = 17;
const ROWS_TOP = HEAD_Y + HEAD_H + 1;
const ROW_H = 26;
const FOOTER_H = 17;
const FOOTER_Y = MAIN.y + MAIN.height - FOOTER_H;
const GUTTER = 88;
const CELL_X = MAIN.x + GUTTER;
const PAD_PAD = 3;
const CELL_RIGHT = MAIN.x + MAIN.width - 5;

/** The inspector's three sections, stacked. */
const INS_CLIP_Y = INSPECTOR.y + 4;
const INS_SCENE_Y = INSPECTOR.y + 104;
const INS_SAFE_Y = INSPECTOR.y + 174;
const INS_PAD = 7;

/** Depths: one opaque cover, the frames, the marks, the live state, the text. */
const DEPTH_BACK = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 970;
const DEPTH_MARK = 972;
const DEPTH_STATE = 976;
const DEPTH_HOVER = 977;
const DEPTH_TEXT = 980;

/** The mode buttons, as the mockup labels them. */
const MODE_ROWS: { id: LiveMode; label: string }[] = [
  { id: 'perform', label: 'PERFORM' },
  { id: 'edit', label: 'EDIT' },
];

export class LiveView {
  private readonly scene: Phaser.Scene;
  private readonly handlers: LiveHandlers;

  private readonly back: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly stateGfx: Phaser.GameObjects.Graphics;
  private readonly hoverGfx: Phaser.GameObjects.Graphics;
  private readonly layer: Phaser.GameObjects.Container;
  private readonly curtain: Phaser.GameObjects.Zone;

  /** The status line's own words, updated every step without a full rebuild. */
  private readonly statusPlaying: Phaser.GameObjects.Text;
  private readonly statusQueued: Phaser.GameObjects.Text;
  private readonly statusCount: Phaser.GameObjects.Text;

  /** The one DOM text box the page owns: a scene's name. */
  private readonly nameBox: RenameBox;
  private renameIndex = -1;
  private nameBoxRect: Rect | null = null;

  /** Rebuilt on each render: the copy this paint drew, and every click zone. */
  private texts: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];

  /** The page's own view state. */
  private cursor: LiveCursor = { row: 0, col: 0 };
  private firstRow = 0;
  private status = '';
  private lastPlaying: number | null = null;
  private lastQueued: number | null = null;
  private state: LiveState = { playing: null, queued: null, progress: 0, countdown: null };

  /** Row and pad boxes from the last render, for the live overlays. */
  private rowRects: (Rect | null)[] = [];
  private padRects = new Map<string, Rect>();

  private hover: string | null = null;
  private hoverRect: Rect | null = null;

  private opened = false;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, handlers: LiveHandlers) {
    this.scene = scene;
    this.handlers = handlers;

    this.back = scene.add.graphics().setDepth(DEPTH_BACK);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);
    this.marks = scene.add.graphics().setDepth(DEPTH_MARK);
    this.stateGfx = scene.add.graphics().setDepth(DEPTH_STATE);
    this.hoverGfx = scene.add.graphics().setDepth(DEPTH_HOVER);
    this.layer = scene.add.container(0, 0).setDepth(DEPTH_TEXT);

    this.statusPlaying = this.statusText(196);
    this.statusQueued = this.statusText(352);
    this.statusCount = this.statusText(500);

    this.curtain = scene.add.zone(0, PAGE_TOP, CANVAS_W, PAGE_BOTTOM - PAGE_TOP).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);

    this.nameBox = new RenameBox(scene, {
      rect: () => (this.renameIndex >= 0 ? this.nameBoxRect : null),
      maxLength: 16,
      ariaLabel: 'Scene name',
      onCommit: (value) => {
        const index = this.renameIndex;
        this.renameIndex = -1;
        const name = tidySceneName(value);
        if (index >= 0 && name !== '' && sceneNameProblem(name) === null) {
          this.handlers.renameScene(index, name);
        }
        this.render();
      },
      onEditingChange: (editing) => {
        this.handlers.setTextEditing(editing);
        if (!editing) this.render();
      },
    });

    this.unsubscribe = onThemeChanged(() => { if (this.opened) this.render(); });
    this.setOpen(false);
  }

  get isOpen(): boolean { return this.opened; }

  /** True while the scene-name box owns the keyboard, so the scene keeps quiet. */
  get isRenaming(): boolean { return this.nameBox.isOpen; }

  show(): void {
    this.cursor = clampLiveCursor(this.handlers.song(), this.cursor);
    this.firstRow = 0;
    this.status = '';
    this.lastPlaying = null;
    this.lastQueued = null;
    this.setOpen(true);
    this.render();
  }

  hide(): void {
    this.nameBox.finish(true);
    this.setOpen(false);
  }

  private setOpen(open: boolean): void {
    const changed = open !== this.opened;
    this.opened = open;
    for (const g of [this.back, this.frame, this.marks, this.stateGfx, this.hoverGfx]) g.setVisible(open);
    this.layer.setVisible(open);
    this.curtain.setVisible(open);
    for (const text of this.texts) text.setVisible(open);
    for (const zone of this.zones) zone.setVisible(open);
    this.statusPlaying.setVisible(open);
    this.statusQueued.setVisible(open);
    this.statusCount.setVisible(open);
    if (changed) this.handlers.onOpenChange?.(open);
  }

  // --- keyboard -------------------------------------------------------------

  /**
   * `ARROWS/WASD` select  ·  `SPACE` launch scene  ·  `ENTER` hear  ·
   * `[`/`]` step a clip  ·  `DEL` silence a clip  ·  `Q` quantize  ·
   * `E` perform/edit  ·  `N` new scene  ·  `ESCAPE` back.
   */
  handleKey(e: KeyboardEvent): void {
    switch (e.code) {
      case 'Escape':
        e.preventDefault();
        this.handlers.close();
        return;
      case 'ArrowUp': case 'KeyW':
        e.preventDefault();
        this.move(-1, 0);
        return;
      case 'ArrowDown': case 'KeyS':
        e.preventDefault();
        this.move(1, 0);
        return;
      case 'ArrowLeft': case 'KeyA':
        e.preventDefault();
        this.move(0, -1);
        return;
      case 'ArrowRight': case 'KeyD':
        e.preventDefault();
        this.move(0, 1);
        return;
      case 'Space':
        e.preventDefault();
        this.launchSelected();
        return;
      case 'Enter': case 'NumpadEnter':
        e.preventDefault();
        this.auditionSelected();
        return;
      case 'BracketLeft':
        e.preventDefault();
        this.cycleSelectedClip(-1);
        return;
      case 'BracketRight':
        e.preventDefault();
        this.cycleSelectedClip(1);
        return;
      case 'Delete': case 'Backspace':
        e.preventDefault();
        this.silenceSelected();
        return;
      case 'KeyQ':
        e.preventDefault();
        this.handlers.setQuantize(nextQuantize(this.handlers.quantize(), e.shiftKey ? -1 : 1));
        this.status = `QUANTIZE ${quantizeLabel(this.handlers.quantize())}`;
        this.render();
        return;
      case 'KeyE':
        e.preventDefault();
        this.handlers.setMode(this.handlers.mode() === 'edit' ? 'perform' : 'edit');
        this.render();
        return;
      case 'KeyN':
        e.preventDefault();
        this.addScene();
        return;
      default:
    }
  }

  private move(dRow: number, dCol: number): void {
    const song = this.handlers.song();
    this.cursor = moveLiveCursor(song, this.cursor, dRow, dCol);
    this.selectColumn(song, this.cursor.col);
    this.render();
  }

  /** Select a CHANNEL — the machine column has no channel to move the tracker to. */
  private selectColumn(song: Song, col: number): void {
    if (!isMachineColumn(song, col)) this.handlers.select(col);
  }

  private launchSelected(): void {
    if (this.cursor.row >= this.handlers.song().scenes.length) {
      this.status = 'NO SCENE TO LAUNCH';
      this.render();
      return;
    }
    const ok = this.handlers.launch(this.cursor.row);
    this.status = ok ? `QUEUED  ${quantizeLabel(this.handlers.quantize())}` : 'NO SUCH SCENE';
    this.render();
  }

  private auditionSelected(): void {
    if (this.cursor.row >= this.handlers.song().scenes.length) return;
    this.handlers.audition(this.cursor.row, this.cursor.col);
  }

  private canEdit(): boolean { return this.handlers.mode() === 'edit'; }

  private cycleSelectedClip(direction: number): void {
    if (!this.canEdit()) { this.status = 'SWITCH TO EDIT TO CHANGE CLIPS'; this.render(); return; }
    const song = this.handlers.song();
    if (this.cursor.row >= song.scenes.length) return;
    const clip = sceneCells(song, this.cursor.row)[this.cursor.col] ?? null;
    const machine = isMachineColumn(song, this.cursor.col);
    const next = machine ? cycleMachineBar(song, clip, direction) : cycleClip(song, clip, direction);
    this.handlers.beginEdit();
    this.handlers.setClip(this.cursor.row, this.cursor.col, next);
    this.status = machine ? machineBarLabel(next) : cellText(next);
    this.render();
  }

  private silenceSelected(): void {
    if (!this.canEdit()) { this.status = 'SWITCH TO EDIT TO CHANGE CLIPS'; this.render(); return; }
    const song = this.handlers.song();
    if (this.cursor.row >= song.scenes.length) return;
    this.handlers.beginEdit();
    this.handlers.setClip(this.cursor.row, this.cursor.col, null);
    this.status = 'SILENT';
    this.render();
  }

  // --- the paint ------------------------------------------------------------

  render(): void {
    const c = activeColors();
    const song = this.handlers.song();
    const cols = liveColumnCount(song);
    const rows = Math.max(1, Math.floor((FOOTER_Y - ROWS_TOP) / ROW_H));
    const total = song.scenes.length;

    this.cursor = clampLiveCursor(song, this.cursor);
    if (this.cursor.row < this.firstRow) this.firstRow = this.cursor.row;
    if (this.cursor.row >= this.firstRow + rows) this.firstRow = this.cursor.row - rows + 1;
    this.firstRow = Math.max(0, Math.min(Math.max(0, total - rows), this.firstRow));

    this.back.clear();
    this.back.fillStyle(c.ink, 1);
    this.back.fillRect(0, PAGE_TOP, CANVAS_W, PAGE_BOTTOM - PAGE_TOP);

    this.hoverRect = null;
    this.frame.clear();
    this.marks.clear();
    this.hoverGfx.clear();
    this.rowRects = [];
    this.padRects.clear();
    this.nameBoxRect = null;
    for (const text of this.texts) text.destroy();
    this.texts = [];
    for (const zone of this.zones) zone.destroy();
    this.zones = [];

    drawPanel(this.frame, STATUS, 1, c);
    drawPanel(this.frame, MAIN, 1, c);
    drawPanel(this.frame, INSPECTOR, 1, c);
    drawPanel(this.frame, STRIP, 1, c);

    this.drawStatusChrome(c);
    this.drawGrid(song, cols, rows, total, c);
    this.drawInspector(song, c);
    this.drawStrip(c);
    this.drawHints(c);

    // The status line's own words are painted from the cached state, so a rebuild
    // (an edit, a mode change) never shows a stale performance.
    this.updateStatus();
    this.paintState();
    this.paintHover();
  }

  /** The status line's static chrome: the title and the mode toggle. */
  private drawStatusChrome(c: UiColors): void {
    this.pushText(STATUS.x + 8, STATUS.y + 4, 'LIVE', c.ooze, 8);
    this.pushText(STATUS.x + 40, STATUS.y + 4, 'PLAY YOUR PATTERNS', c.textDim, 8);
    const mode = this.handlers.mode();
    const w = 76;
    MODE_ROWS.forEach((row, index) => {
      const r: Rect = { x: STATUS.x + STATUS.width - 8 - (MODE_ROWS.length - index) * (w + 4), y: STATUS.y + 2, width: w, height: STATUS.height - 4 };
      const on = mode === row.id;
      this.control(`mode:${row.id}`, r, row.label, () => this.handlers.setMode(row.id), { inset: !on, size: 8, color: on ? c.ooze : c.textPrimary });
    });
  }

  /** The launch grid: channel headers, one row per scene, and the footer. */
  private drawGrid(song: Song, cols: number, rows: number, total: number, c: UiColors): void {
    this.pushText(MAIN.x + 8, HEAD_Y + 4, 'SCENES', c.textDim, 8);

    const cellW = Math.max(22, Math.floor((CELL_RIGHT - CELL_X) / cols));

    for (let col = 0; col < cols; col++) {
      const x = CELL_X + col * cellW;
      if (isMachineColumn(song, col)) {
        // The drum machine is a column, so its header reads as one: a swatch, its
        // name and the word KIT where a channel shows its voice.
        this.marks.fillStyle(c.ooze, 0.95);
        this.marks.fillRect(x + 4, HEAD_Y + 2, 9, 12);
        this.pushText(x + 17, HEAD_Y + 2, 'DRUMS'.slice(0, Math.max(1, Math.floor((cellW - 20) / 6))), c.ooze, 8);
        this.pushText(x + 17, HEAD_Y + 10, 'KIT', c.textDim, 8);
        continue;
      }
      const track = song.tracks[col];
      const color = trackColor(col, c);
      this.marks.fillStyle(color, 0.95);
      this.marks.fillRect(x + 4, HEAD_Y + 2, 9, 12);
      this.pushText(x + 17, HEAD_Y + 2, (track?.name ?? `CH ${col + 1}`).slice(0, Math.max(1, Math.floor((cellW - 20) / 6))), color, 8);
      const voice = track ? voiceNameFor(track.voice) : '';
      this.pushText(x + 17, HEAD_Y + 10, voice.toUpperCase().slice(0, Math.max(1, Math.floor((cellW - 20) / 6))), c.textDim, 8);
    }
    this.marks.fillStyle(c.textDim, 0.25);
    this.marks.fillRect(MAIN.x + 5, HEAD_Y + HEAD_H, MAIN.width - 10, 1);

    const visible = Math.min(rows, total);
    for (let at = 0; at < visible; at++) {
      const row = this.firstRow + at;
      const y = ROWS_TOP + at * ROW_H;
      const box: Rect = { x: MAIN.x + 5, y, width: MAIN.width - 10, height: ROW_H - 2 };
      this.rowRects[row] = box;
      const selectedRow = row === this.cursor.row;
      if (selectedRow) {
        this.marks.fillStyle(c.ward, 0.10);
        this.marks.fillRect(box.x, box.y, box.width, box.height);
      }
      const scene = song.scenes[row];
      this.pushText(MAIN.x + 9, y + 3, String(row + 1).padStart(2, '0'), c.textDim, 8);
      const name = (scene?.name ?? `SCENE ${row + 1}`).slice(0, 11);
      this.pushText(MAIN.x + 26, y + 3, name, c.textPrimary, 8);
      const play: Rect = { x: MAIN.x + 8, y: y + 11, width: 12, height: 12 };
      this.control(`play:${row}`, play, '>', () => this.launchScene(row), { inset: true, size: 8, color: c.ooze });

      const cells = sceneCells(song, row);
      for (let col = 0; col < cols; col++) {
        const cr: Rect = { x: CELL_X + col * cellW + PAD_PAD, y: y + 1, width: cellW - PAD_PAD * 2, height: ROW_H - 4 };
        this.padRects.set(`${row}:${col}`, cr);
        this.drawPad(cr, cells[col] ?? null, col, row, song, c);
      }
    }

    if (total === 0) this.drawEmptyState(c);

    const addR: Rect = { x: MAIN.x + 8, y: FOOTER_Y + 1, width: 64, height: 14 };
    this.control('add-scene', addR, '+ SCENE', () => this.addScene(), { size: 8, color: c.ooze });
    this.pushText(MAIN.x + 78, FOOTER_Y + 4, `${total} / ${MAX_SCENES} SCENES`, c.textDim, 8);
    this.pushText(MAIN.x + MAIN.width - 8, FOOTER_Y + 4, 'SOLID: PLAYING  /  DASHED: QUEUED', c.textDim, 8, 1);
    this.marks.fillStyle(c.textDim, 0.25);
    this.marks.fillRect(MAIN.x + 5, FOOTER_Y - 1, MAIN.width - 10, 1);
  }

  /** One clip pad: filled and previewed when it plays, a dashed well when silent. */
  private drawPad(r: Rect, clip: number | null, col: number, row: number, song: Song, c: UiColors): void {
    const machine = isMachineColumn(song, col);
    const color = machine ? c.ooze : trackColor(col, c);
    const selected = row === this.cursor.row && col === this.cursor.col;
    if (clip === null) {
      drawInset(this.marks, r, 1, c);
      this.pushText(r.x + 3, r.y + 4, 'SILENT', c.textDim, 8);
      this.marks.fillStyle(c.textDim, 0.35);
      this.marks.fillRect(r.x + 3, r.y + r.height - 8, Math.max(4, r.width - 6), 1);
      this.drawDashes(this.marks, r, c.textDim, 0.4);
    } else {
      this.marks.fillStyle(mix(c.ink, color, 0.5), 0.9);
      this.marks.fillRect(r.x, r.y, r.width, r.height);
      this.marks.fillStyle(color, 0.95);
      this.marks.fillRect(r.x, r.y, r.width, 1);
      this.marks.fillRect(r.x, r.y + r.height - 1, r.width, 1);
      this.marks.fillRect(r.x, r.y, 1, r.height);
      this.marks.fillRect(r.x + r.width - 1, r.y, 1, r.height);
      this.pushText(r.x + 3, r.y + 2, machine ? machineBarLabel(clip) : cellText(clip), color, 8);
      this.pushText(r.x + r.width - 4, r.y + 2, '1 BAR', color, 8, 1);
      if (machine) this.drawMachinePreview(r, clip, song, color);
      else this.drawPreview(r, clip, col, song, color);
    }
    if (selected) {
      this.marks.lineStyle(1, c.textPrimary, 0.95);
      this.marks.strokeRect(r.x - 0.5, r.y - 0.5, r.width + 1, r.height + 1);
    }
    const zone = this.scene.add.zone(r.x, r.y, r.width, r.height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.setDepth(DEPTH_TEXT - 1);
    zone.on('pointerdown', () => this.cellPress(row, col));
    zone.on('pointerover', () => { if (this.hover !== `c:${row}:${col}`) { this.hover = `c:${row}:${col}`; this.hoverRect = r; this.paintHover(); } });
    zone.on('pointerout', () => { if (this.hover === `c:${row}:${col}`) { this.hover = null; this.hoverRect = null; this.paintHover(); } });
    this.zones.push(zone);
  }

  /** A clip's note preview: one dash per note, placed by step and pitch. */
  private drawPreview(r: Rect, clip: number, col: number, song: Song, color: number): void {
    const notes = clipPreview(song, clip, col);
    const steps = Math.max(1, patternStepCount(song, clip));
    const innerX = r.x + 3;
    const innerY = r.y + 12;
    const innerW = Math.max(4, r.width - 6);
    const innerH = Math.max(3, r.height - 20);
    if (notes.length === 0) {
      this.marks.fillStyle(color, 0.3);
      this.marks.fillRect(innerX, innerY + Math.round(innerH / 2), innerW, 1);
      return;
    }
    for (const note of notes) {
      const px = innerX + Math.round((note.step / steps) * innerW);
      const frac = Math.max(0, Math.min(1, (note.pitch - 36) / 48));
      const py = innerY + Math.round((1 - frac) * innerH);
      this.marks.fillStyle(color, 0.95);
      this.marks.fillRect(Math.max(innerX, Math.min(innerX + innerW - 3, px)), py, 3, 1);
    }
  }

  /** A machine bar's preview: a dash per active pad step, by pad and by step. */
  private drawMachinePreview(r: Rect, bar: number, song: Song, color: number): void {
    const machine = song.machine;
    const pad = r.x + 3;
    const top = r.y + 12;
    const width = Math.max(4, r.width - 6);
    const height = Math.max(3, r.height - 20);
    if (!machine) return;
    const rows = machineBarRows(machine, bar);
    const steps = Math.max(1, machine.steps);
    rows.forEach((row, padIndex) => {
      const frac = rows.length <= 1 ? 0.5 : padIndex / (rows.length - 1);
      const y = top + Math.round((1 - frac) * height);
      row.forEach((velocity, step) => {
        if (!(velocity > 0)) return;
        const x = pad + Math.round((step / steps) * width);
        this.marks.fillStyle(color, 0.95);
        this.marks.fillRect(Math.max(pad, Math.min(pad + width - 3, x)), y, 3, 1);
      });
    });
  }

  /** The inspector's three sections. */
  private drawInspector(song: Song, c: UiColors): void {
    const cols = liveColumnCount(song);
    const x = INSPECTOR.x + INS_PAD;
    const w = INSPECTOR.width - INS_PAD * 2;
    const row = this.cursor.row;
    const col = Math.min(cols - 1, this.cursor.col);
    const scene = song.scenes[row];
    const clip = sceneCells(song, row)[col] ?? null;
    const machineCol = isMachineColumn(song, col);
    const color = machineCol ? c.ooze : trackColor(col, c);
    const track = song.tracks[col];
    const channelName = (machineCol ? 'DRUM MACHINE' : (track?.name ?? `CH ${col + 1}`)).toUpperCase().slice(0, 12);

    // --- THIS CLIP ---
    this.pushText(x, INS_CLIP_Y + 2, 'THIS CLIP', c.textDim, 8);
    this.marks.fillStyle(color, 0.95);
    this.marks.fillRect(x, INS_CLIP_Y + 13, 10, 10);
    const title = scene ? `${scene.name.toUpperCase().slice(0, 10)}  /  ${channelName}` : `${channelName}`;
    this.pushText(x + 15, INS_CLIP_Y + 14, title, color, 8);

    const stepY = INS_CLIP_Y + 24;
    const prev: Rect = { x, y: stepY, width: 18, height: 15 };
    const nextR: Rect = { x: x + w - 18, y: stepY, width: 18, height: 15 };
    const field: Rect = { x: x + 20, y: stepY, width: w - 40, height: 15 };
    drawInset(this.marks, field, 1, c);
    this.pushCentered(field, machineCol ? machineBarLabel(clip) : (clip === null ? 'SILENT' : `P${clip}`), clip === null ? c.textDim : color, 8);
    this.control('clip-prev', prev, '<', () => this.cycleSelectedClip(-1), { inset: true, size: 8, color: this.canEdit() ? c.textPrimary : c.textDim });
    this.control('clip-next', nextR, '>', () => this.cycleSelectedClip(1), { inset: true, size: 8, color: this.canEdit() ? c.textPrimary : c.textDim });
    const steps = machineCol ? (song.machine?.steps ?? 0) : (clip === null ? 0 : patternStepCount(song, clip));
    const caption = machineCol
      ? (clip === null ? 'NO BAR' : `BAR ${clip}  /  ${steps} STEPS`)
      : (clip === null ? 'NO PATTERN' : `PATTERN ${clip}  /  ${steps} STEPS`);
    this.pushText(x, stepY + 17, caption, c.textDim, 8);

    const well: Rect = { x, y: stepY + 24, width: w, height: 28 };
    drawInset(this.marks, well, 1, c);
    if (clip !== null && machineCol) {
      this.drawMachinePreview(well, clip, song, color);
    } else if (clip !== null) {
      const notes = clipPreview(song, clip, col);
      const count = Math.max(1, patternStepCount(song, clip));
      for (const note of notes) {
        const px = well.x + 4 + Math.round((note.step / count) * (well.width - 8));
        const frac = Math.max(0, Math.min(1, (note.pitch - 36) / 48));
        const py = well.y + 4 + Math.round((1 - frac) * (well.height - 9));
        this.marks.fillStyle(color, 0.95);
        this.marks.fillRect(px, py, 3, 1);
      }
    }
    this.pushCentered({ x: well.x, y: well.y + well.height - 9, width: well.width, height: 8 }, '1 BAR', c.textDim, 8);

    const hear: Rect = { x, y: stepY + 52, width: Math.floor((w - 6) / 2), height: 15 };
    const silent: Rect = { x: x + Math.floor((w - 6) / 2) + 6, y: stepY + 52, width: w - Math.floor((w - 6) / 2) - 6, height: 15 };
    this.control('hear', hear, 'HEAR', () => this.auditionSelected(), { size: 8, color: c.textPrimary });
    this.control('silent', silent, 'SET SILENT', () => this.silenceSelected(), { inset: true, size: 8, color: this.canEdit() ? c.textPrimary : c.textDim });
    this.pushText(x, stepY + 69, this.canEdit() ? 'Cells cycle in EDIT mode.' : 'Switch to EDIT to change clips.', c.textDim, 8);

    // --- THIS SCENE ---
    this.pushText(x, INS_SCENE_Y, 'THIS SCENE', c.textDim, 8);
    const nameR: Rect = { x: x + 46, y: INS_SCENE_Y - 2, width: w - 46, height: 15 };
    drawInset(this.marks, nameR, 1, c);
    this.pushCentered(nameR, scene ? scene.name : '--', c.textPrimary, 8);
    this.nameBoxRect = nameR;
    if (scene) {
      const z = this.scene.add.zone(nameR.x, nameR.y, nameR.width, nameR.height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      z.setDepth(DEPTH_TEXT - 1);
      z.on('pointerdown', () => { this.renameIndex = row; this.nameBox.start(scene.name); });
      this.zones.push(z);
    }
    const launch: Rect = { x, y: INS_SCENE_Y + 16, width: w, height: 18 };
    this.control('launch', launch, '> LAUNCH SCENE', () => this.launchScene(row), { size: 8, color: c.ooze });
    const dup: Rect = { x, y: INS_SCENE_Y + 37, width: Math.floor((w - 6) / 2), height: 15 };
    const del: Rect = { x: x + Math.floor((w - 6) / 2) + 6, y: INS_SCENE_Y + 37, width: w - Math.floor((w - 6) / 2) - 6, height: 15 };
    this.control('dup', dup, 'DUPLICATE', () => { if (scene) this.handlers.duplicateScene(row); }, { inset: true, size: 8, color: scene ? c.textPrimary : c.textDim });
    this.control('del', del, 'DELETE', () => { if (scene) this.handlers.deleteScene(row); }, { inset: true, size: 8, color: scene ? c.danger : c.textDim });
    this.pushText(x, INS_SCENE_Y + 52, 'Scene edits change your song.', c.textDim, 8);
    this.pushText(x, INS_SCENE_Y + 61, 'Launches only change playback.', c.textDim, 8);

    // --- PERFORM SAFELY ---
    this.pushText(x, INS_SAFE_Y, 'PERFORM SAFELY', c.ooze, 8);
    this.pushText(x, INS_SAFE_Y + 10, 'Launch a row on the next bar.', c.textDim, 8);
    this.pushText(x, INS_SAFE_Y + 18, 'Silent cells stop their track.', c.textDim, 8);
    const script: Rect = { x, y: INS_SAFE_Y + 25, width: w, height: 15 };
    this.control('script', script, 'OPEN SCRIPT', () => this.handlers.openScript(), { inset: true, size: 8, color: c.textPrimary });
  }

  /** The quantize strip and STOP ALL. */
  private drawStrip(c: UiColors): void {
    this.pushText(STRIP.x + 10, STRIP.y + 4, 'LAUNCH QUANTIZE', c.ooze, 8);
    const choices = LIVE_QUANTIZE_CHOICES;
    const w = 62;
    const y = STRIP.y + 5;
    choices.forEach((bars, index) => {
      const r: Rect = { x: STRIP.x + 128 + index * (w + 5), y, width: w, height: 20 };
      const on = this.handlers.quantize() === bars;
      this.control(`q:${bars}`, r, quantizeLabel(bars), () => { this.handlers.setQuantize(bars); this.status = `QUANTIZE ${quantizeLabel(bars)}`; this.render(); }, { inset: !on, size: 8, color: on ? c.ooze : c.textPrimary });
    });
    const stop: Rect = { x: STRIP.x + STRIP.width - 120, y, width: 110, height: 20 };
    this.control('stop', stop, 'STOP ALL', () => { this.handlers.stopAll(); this.status = 'STOP ALL QUEUED'; this.render(); }, { size: 8, color: c.danger });
    this.pushText(stop.x + stop.width, STRIP.y + 26, 'Returns to song order', c.textDim, 8, 1);
    if (this.status) this.pushText(STRIP.x + 128, STRIP.y + 26, this.status, c.textDim, 8);
  }

  private drawHints(c: UiColors): void {
    const y = STRIP.y + STRIP.height + 2;
    this.pushText(STRIP.x + 10, y, 'ARROWS SELECT   /   SPACE LAUNCH SCENE   /   ENTER HEAR   /   Q QUANTIZE   /   E EDIT', c.textDim, 8);
  }

  /** The welcoming empty state: the create call to action, and a pointer. */
  private drawEmptyState(c: UiColors): void {
    const box: Rect = { x: MAIN.x + 20, y: ROWS_TOP + 14, width: MAIN.width - 40, height: ROW_H * 3 };
    drawInset(this.marks, box, 1, c);
    this.pushCentered({ x: box.x, y: box.y + 10, width: box.width, height: 12 }, 'NO SCENES YET', c.ooze, 9);
    this.pushCentered({ x: box.x, y: box.y + 26, width: box.width, height: 10 }, 'A SCENE IS ONE PATTERN PER CHANNEL.', c.textDim, 8);
    this.pushCentered({ x: box.x, y: box.y + 38, width: box.width, height: 10 }, 'CREATE ONE HERE, OR WRITE A scene LINE.', c.textDim, 8);
    const create: Rect = { x: MAIN.x + Math.round(MAIN.width / 2) - 50, y: box.y + 56, width: 100, height: 18 };
    this.control('empty-create', create, '+ CREATE SCENE', () => this.addScene(), { size: 8, color: c.ooze });
  }

  // --- the live state -------------------------------------------------------

  /** The per-step performance state: the countdown, the outlines, the progress. */
  setLiveState(state: LiveState): void {
    const sceneChanged = state.playing !== this.lastPlaying || state.queued !== this.lastQueued;
    this.lastPlaying = state.playing;
    this.lastQueued = state.queued;
    this.state = state;
    // A scene changing means the row shapes change, which needs the full paint.
    if (sceneChanged && this.opened) this.render();
    this.updateStatus();
    this.paintState();
  }

  private updateStatus(): void {
    if (!this.opened) return;
    const c = activeColors();
    const song = this.handlers.song();
    const name = (index: number | null): string => (index === null ? '' : (song.scenes[index]?.name ?? `SCENE ${index + 1}`).toUpperCase());
    const playing = this.state.playing;
    const queued = this.state.queued;
    this.statusPlaying.setText(playing === null ? 'PLAYING: --' : `PLAYING: ${name(playing)}`);
    this.statusPlaying.setColor(intToCss(playing === null ? c.textDim : c.ooze));
    this.statusQueued.setText(queued === null ? '' : `QUEUED: ${name(queued)}`);
    this.statusQueued.setColor(intToCss(c.ward));
    const count = this.state.countdown;
    this.statusCount.setText(count === null ? '' : `NEXT  /  ${count.elapsed} BEATS`);
    this.statusCount.setColor(intToCss(c.textDim));
  }

  private paintState(): void {
    const g = this.stateGfx;
    g.clear();
    if (!this.opened) return;
    const c = activeColors();
    const queued = this.state.queued;
    if (queued !== null && this.rowRects[queued]) {
      this.drawDashes(g, this.rowRects[queued]!, c.ward, 0.95, 2, 3);
    }
    const playing = this.state.playing;
    if (playing !== null && this.rowRects[playing]) {
      const box = this.rowRects[playing]!;
      g.fillStyle(c.ooze, 0.10);
      g.fillRect(box.x, box.y, box.width, box.height);
      g.fillStyle(c.ooze, 0.95);
      g.fillRect(box.x, box.y, 2, box.height);
      g.lineStyle(1, c.ooze, 0.8);
      g.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1);
      const progress = Math.max(0, Math.min(1, this.state.progress));
      for (const [key, r] of this.padRects) {
        if (!key.startsWith(`${playing}:`)) continue;
        g.fillStyle(c.ooze, 0.9);
        g.fillRect(r.x, r.y + r.height - 3, Math.max(1, Math.round(r.width * progress)), 2);
      }
    }
    const count = this.state.countdown;
    if (count !== null) {
      const total = Math.min(8, Math.max(1, count.total));
      for (let i = 0; i < total; i++) {
        const x = STATUS.x + 566 + i * 9;
        const y = STATUS.y + 5;
        if (i < count.elapsed) {
          g.fillStyle(c.ooze, 1);
          g.fillRect(x, y, 6, 7);
        } else {
          g.lineStyle(1, c.textDim, 0.7);
          g.strokeRect(x + 0.5, y + 0.5, 5, 6);
        }
      }
    }
  }

  // --- interactions ---------------------------------------------------------

  private cellPress(row: number, col: number): void {
    if (this.cursor.row === row && this.cursor.col === col) {
      this.cycleSelectedClip(1);
      return;
    }
    this.cursor = { row, col };
    this.selectColumn(this.handlers.song(), col);
    this.render();
  }

  private launchScene(row: number): void {
    const ok = this.handlers.launch(row);
    this.status = ok ? `QUEUED  ${quantizeLabel(this.handlers.quantize())}` : 'NO SUCH SCENE';
    this.render();
  }

  private addScene(): void {
    this.handlers.addScene();
    this.handlers.setMode('edit');
    this.cursor = clampLiveCursor(this.handlers.song(), { row: this.handlers.song().scenes.length - 1, col: this.cursor.col });
    this.status = 'SCENE ADDED';
    this.render();
  }

  /**
   * A framed control: a raised panel (or a recessed field) with a label, a click
   * action and a hover state — the same shape the arranger's controls use.
   */
  private control(
    id: string,
    r: Rect,
    label: string,
    onPress: () => void,
    opts: { inset?: boolean; size?: number; color?: number } = {},
  ): void {
    const c = activeColors();
    if (opts.inset) drawInset(this.marks, r, 1, c);
    else drawPanel(this.marks, r, 1, c);
    this.pushCentered(r, label, opts.color ?? c.textPrimary, opts.size ?? 8);
    if (this.hover === id) this.hoverRect = r;
    const zone = this.scene.add.zone(r.x, r.y, r.width, r.height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.setDepth(DEPTH_TEXT - 1);
    zone.on('pointerdown', () => onPress());
    zone.on('pointerover', () => { if (this.hover !== id) { this.hover = id; this.hoverRect = r; this.paintHover(); } });
    zone.on('pointerout', () => { if (this.hover === id) { this.hover = null; this.hoverRect = null; this.paintHover(); } });
    this.zones.push(zone);
  }

  /** A dashed rectangle, drawn by hand — Phaser has no dashed stroke. */
  private drawDashes(g: Phaser.GameObjects.Graphics, r: Rect, color: number, alpha: number, dash = 3, gap = 3): void {
    g.fillStyle(color, alpha);
    const step = dash + gap;
    for (let x = r.x; x < r.x + r.width; x += step) {
      const w = Math.min(dash, r.x + r.width - x);
      g.fillRect(x, r.y, w, 1);
      g.fillRect(x, r.y + r.height - 1, w, 1);
    }
    for (let y = r.y; y < r.y + r.height; y += step) {
      const h = Math.min(dash, r.y + r.height - y);
      g.fillRect(r.x, y, 1, h);
      g.fillRect(r.x + r.width - 1, y, 1, h);
    }
  }

  private paintHover(): void {
    const g = this.hoverGfx;
    g.clear();
    const r = this.hoverRect;
    if (!r) return;
    const c = activeColors();
    g.lineStyle(1, c.ward, 0.9);
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1);
  }

  // --- paint helpers --------------------------------------------------------

  private statusText(x: number): Phaser.GameObjects.Text {
    const obj = uiText(this.scene, x, STATUS.y + 4, '', { size: 8, color: activeColors().textPrimary });
    obj.setDepth(DEPTH_TEXT + 1);
    return obj;
  }

  private pushText(x: number, y: number, text: string, color: number, size = 8, originX = 0): void {
    const obj = uiText(this.scene, x, y, text, { size, color, origin: { x: originX, y: 0 } });
    this.layer.add(obj);
    this.texts.push(obj);
  }

  private pushCentered(r: Rect, text: string, color: number, size = 8): void {
    const px = uiPx(size);
    const obj = uiText(this.scene, Math.round(r.x + r.width / 2), Math.round(r.y + (r.height - px) / 2), text, {
      size, color, origin: { x: 0.5, y: 0 },
    });
    this.layer.add(obj);
    this.texts.push(obj);
  }

  destroy(): void {
    this.unsubscribe();
    this.nameBox.destroy();
    for (const text of this.texts) text.destroy();
    for (const zone of this.zones) zone.destroy();
    this.statusPlaying.destroy();
    this.statusQueued.destroy();
    this.statusCount.destroy();
    this.back.destroy();
    this.frame.destroy();
    this.marks.destroy();
    this.stateGfx.destroy();
    this.hoverGfx.destroy();
    this.layer.destroy();
    this.curtain.destroy();
  }
}
