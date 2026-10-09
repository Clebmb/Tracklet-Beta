import type Phaser from 'phaser';
import {
  activeColors,
  drawInset,
  drawPanel,
  mix,
  onThemeChanged,
  uiPx,
  uiText,
  type Rect,
  type UiColors,
} from 'phaser-ui-canvas';

import {
  AUTOMATION_TARGETS,
  AUTOMATION_TARGET_BY_ID,
  clampAutomationValue,
  type AutomationLane,
  type AutomationTargetId,
} from '../model/automation';
import { orderSectionLabels } from '../model/sections';
import type { Pattern, Song } from '../model/song';
import type { BounceRange } from '../model/bounce';
import { voiceNameFor } from '../model/voice';
import {
  laneValueAtY,
  laneYAtValue,
  moveLane,
  resizeLane,
  timelineBarAt,
  timelineBarCount,
  timelineView,
  timelineXAt,
  type TimelineView,
} from './arrangerBoard';
import { trackColor } from './trackColor';

/**
 * ArrangerView — the ARRANGER page, the app's fourth full screen.
 *
 * ── A page, not a modal ─────────────────────────────────────────────────────
 * Like the mixer, this is a screen you switch to from the header dropdown, and it
 * stops ABOVE the tracker's own transport bar, which therefore stays up and stays
 * the one transport. There is no second clock to keep in step.
 *
 * ── The layout, and the one grid under it ───────────────────────────────────
 * Three panels share a single bar axis. On the left is the TIMELINE: a section
 * band row, a `BAR` row, a `PATTERN` row, then one row per channel showing the
 * pattern that plays in each bar as a COLOURED BLOCK with a note preview drawn on
 * it — a rest state where the channel is silent, the section each run of bars came
 * from, and the export region bracketed above. On the right is the AUTOMATION
 * inspector for the selected channel and target. Under the timeline is the LANE
 * editor: the value line for that channel and target, with handles.
 *
 * Every column — the bands, the blocks, the playhead and the lane — is placed by
 * the SAME `timelineView`/`timelineXAt` mapping, so a click, a mark and the music
 * can never disagree about where a bar is.
 *
 * ── It holds no song ────────────────────────────────────────────────────────
 * Every number comes back from the scene on each paint and every edit goes back
 * through it, so the page cannot show a stale song and there is exactly one
 * source of truth. The TARGET under edit, the selected lane, the hovered control
 * and the status line are the page's own view state — like a cursor — and are
 * never written to the song.
 *
 * ── Editing ─────────────────────────────────────────────────────────────────
 * `INS` adds a lane, `DEL` takes one out, `TAB` cycles the target, `[`/`]` step
 * the selection, the arrows nudge a value, and `,`/`.` and `;`/`'` move or resize
 * its bars; a click selects a lane and a drag on a handle or the line moves it.
 * The inspector's controls and the lane editor's `+ LANE` do the same work with a
 * mouse. A drag is ONE undo step (the scene banks it at pointer-down) and a key
 * press or a control click is one edit. Everything the page writes goes through
 * `arrangerBoard`'s arithmetic, so a drawn lane is exactly a written one.
 */

/** The lane edit the page asks the scene for, and what it needs to draw one. */
export interface ArrangerHandlers {
  /** The page opened or closed, so the scene can pause its own input and repaint. */
  onOpenChange?: (open: boolean) => void;
  /** The song, read on every redraw so the page cannot show a stale one. */
  song: () => Song;
  /** How many channels the song has. */
  trackCount: () => number;
  /** Which channel the scene is on, so the row highlight agrees with the tracker. */
  selectedChannel: () => number;
  /** The user picked a channel. The scene is what moves the cursor. */
  select: (index: number) => void;
  /** The bars an export renders, or null for the whole song. */
  exportRegion: () => BounceRange | null;
  /** True while the transport runs, so this page can say so. */
  playing: () => boolean;
  /** Start or stop the transport — the same state the visible transport bar shows. */
  togglePlay: () => string;
  /** Leave the page, the way Escape does. */
  close: () => void;

  /** The song's automation lanes, read live. */
  lanes: () => readonly AutomationLane[];
  /** Bank ONE undo step, called at the start of a gesture (a drag, a key press). */
  beginLaneEdit: () => void;
  /** Replace the lane at an index (or append when it is past the end). No undo step. */
  setLane: (index: number, lane: AutomationLane) => void;
  /** Add a fresh lane for a channel and target; answers a status line. */
  addLane: (track: number, target: AutomationTargetId) => string;
  /** Remove the lane at an index; answers a status line. */
  removeLane: (index: number) => string;
}

/** The canvas the app is drawn in. */
const CANVAS_W = 720;
/** Where the page begins and ends, matching every page: above the transport. */
const PAGE_TOP = 39;
const PAGE_BOTTOM = 341;

/** The three framed panels: the timeline, the lane editor and the inspector. */
const MAIN: Rect = { x: 8, y: 41, width: 546, height: 196 };
const LANE_PANEL: Rect = { x: 8, y: 241, width: 546, height: 98 };
const INSPECTOR: Rect = { x: 558, y: 41, width: 154, height: 298 };

/** The channel-name gutter on the left of the timeline, shared by the lane axis. */
const GUTTER_W = 66;
const CONTENT_X = MAIN.x + GUTTER_W;
/** The right edge both the timeline and the lane editor stop at. */
const CONTENT_RIGHT = MAIN.x + MAIN.width - 8;
const CONTENT_W = CONTENT_RIGHT - CONTENT_X;

/** The rows inside the timeline panel, stacked from the top. */
const SECTION_Y = MAIN.y + 24;
const SECTION_H = 13;
const BAR_Y = MAIN.y + 38;
const PATTERN_Y = MAIN.y + 51;
const HEAD_H = 12;
const TRACKS_TOP = MAIN.y + 65;
const TRACKS_BOTTOM = MAIN.y + MAIN.height - 5;
/** Where the export region's bracket is drawn, above the section bands. */
const EXPORT_Y = MAIN.y + 14;

/** The lane editor's value area and its title row. */
const LANE_TITLE_Y = LANE_PANEL.y + 5;
const LANE_VALUE_TOP = LANE_PANEL.y + 18;
const LANE_VALUE_BOTTOM = LANE_PANEL.y + LANE_PANEL.height - 15;
const LANE_VALUE_H = LANE_VALUE_BOTTOM - LANE_VALUE_TOP;

/** The inspector's rows. */
const INS_X = INSPECTOR.x + 8;
const INS_W = INSPECTOR.width - 16;

/** How close a pointer must be to a handle or a line to grab it. */
const GRAB = 6;

/** Render depths: opaque cover < curtain < frame < bars < playhead < text/zones. */
const DEPTH_BACK = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 970;
const DEPTH_BARS = 972;
const DEPTH_PLAY = 978;
const DEPTH_TEXT = 980;

/** The keys the page answers to, printed under the lane editor. */
const HINT = 'DRAG: SHAPE / MOVE · TAB: TARGET · INS/DEL: LANE';

/** The gesture in progress: a lane being moved or one of its ends resized. */
type LaneDrag =
  | { kind: 'move'; index: number; original: AutomationLane; grabBar: number }
  | { kind: 'resize'; index: number; end: 'start' | 'end' };

/** One step of a pattern that this channel plays, for the block's preview. */
interface PreviewNote {
  /** The step inside the pattern, 0-based. */
  step: number;
  /** The pitch, so the preview shows the contour as well as the density. */
  pitch: number;
}

/** Where a channel's notes land inside one bar, so a block can draw them. */
function channelBarPreview(song: Song, bar: number, track: number): PreviewNote[] {
  const pattern = song.patterns[(song.order[bar] ?? 1) - 1] as Pattern | undefined;
  if (!pattern) return [];
  const out: PreviewNote[] = [];
  pattern.steps.forEach((row, step) => {
    const cell = row[track];
    if (cell && cell.note !== null) out.push({ step, pitch: cell.note });
  });
  return out;
}

/**
 * A stable colour per section, drawn from the theme's own accents.
 *
 * A section is a place in the form rather than a channel, so it needs a palette
 * of its own — but still one the theme supplies, so a band keeps working on the
 * light `parchment` theme. Two accents are often the same colour in the shipped
 * theme, so the tail of the list is blended, exactly as `trackColor` does.
 */
function sectionColor(index: number, c: UiColors): number {
  const palette = [
    mix(c.textGreen, c.ward, 0.5),
    c.textGreen,
    c.ward,
    c.danger,
    mix(c.ward, c.danger, 0.5),
    c.ooze,
  ];
  return palette[index % palette.length];
}

export class ArrangerView {
  private readonly scene: Phaser.Scene;
  private readonly handlers: ArrangerHandlers;

  private readonly back: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly laneGfx: Phaser.GameObjects.Graphics;
  private readonly playGfx: Phaser.GameObjects.Graphics;
  private readonly hoverGfx: Phaser.GameObjects.Graphics;
  private readonly layer: Phaser.GameObjects.Container;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly laneZone: Phaser.GameObjects.Zone;

  /** Rebuilt on each render: the copy this paint drew, and every click zone. */
  private texts: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];

  /** The timeline mapping this render used, so the playhead can be placed from it. */
  private view: TimelineView | null = null;
  /** The bar the transport is in (0-based), or -1 stopped. */
  private playBar = -1;

  /** The TARGET the lane strip edits. A view cursor, never written to the song. */
  private target: AutomationTargetId = 'bright';
  /** The lane under edit, as an index into the song's own list, or -1. */
  private selectedLane = -1;
  /** The last thing a lane edit said, drawn in the strip's heading. */
  private status = '';
  /** The control under the pointer, and where it sits, so a button draws itself hot. */
  private hover: string | null = null;
  private hoverRect: Rect | null = null;
  private drag: LaneDrag | null = null;

  private opened = false;
  private readonly unsubscribe: () => void;
  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => this.moveDrag(pointer);
  private readonly onPointerUp = (): void => { this.drag = null; };

  constructor(scene: Phaser.Scene, handlers: ArrangerHandlers) {
    this.scene = scene;
    this.handlers = handlers;

    this.back = scene.add.graphics().setDepth(DEPTH_BACK);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);
    this.bars = scene.add.graphics().setDepth(DEPTH_BARS);
    this.laneGfx = scene.add.graphics().setDepth(DEPTH_BARS);
    this.playGfx = scene.add.graphics().setDepth(DEPTH_PLAY);
    this.hoverGfx = scene.add.graphics().setDepth(DEPTH_PLAY + 1);
    this.layer = scene.add.container(0, 0).setDepth(DEPTH_TEXT);

    // The curtain swallows a click that misses every control, so nothing behind
    // the page is reached — while the transport bar BELOW the page stays clickable.
    this.curtain = scene.add.zone(0, PAGE_TOP, CANVAS_W, PAGE_BOTTOM - PAGE_TOP).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);

    // The lane strip's own click surface: a drag starts here and is followed by
    // the scene's pointer events, because a drag leaves the strip's own bounds.
    this.laneZone = scene.add.zone(CONTENT_X, LANE_VALUE_TOP, CONTENT_W, LANE_VALUE_H).setOrigin(0, 0).setInteractive();
    this.laneZone.setDepth(DEPTH_TEXT - 1);
    this.laneZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.beginDrag(pointer));
    scene.input.on('pointermove', this.onPointerMove);
    scene.input.on('pointerup', this.onPointerUp);

    this.unsubscribe = onThemeChanged(() => { if (this.opened) this.render(); });
    this.setOpen(false);
  }

  /** True while the page is up; the scene pauses its own input while it is. */
  get isOpen(): boolean { return this.opened; }

  show(): void {
    this.playBar = -1;
    // Land on a real lane so the inspector opens with numbers rather than dashes;
    // a deliberate clear afterwards (a click on empty strip) still stands.
    this.selectedLane = this.visibleIndices()[0] ?? -1;
    this.setOpen(true);
    this.render();
  }

  hide(): void { this.setOpen(false); }

  private setOpen(open: boolean): void {
    const changed = open !== this.opened;
    this.opened = open;
    this.back.setVisible(open);
    this.frame.setVisible(open);
    this.bars.setVisible(open);
    this.laneGfx.setVisible(open);
    this.playGfx.setVisible(open);
    this.hoverGfx.setVisible(open);
    this.layer.setVisible(open);
    this.curtain.setVisible(open);
    this.laneZone.setVisible(open);
    for (const text of this.texts) text.setVisible(open);
    for (const zone of this.zones) zone.setVisible(open);
    if (changed) this.handlers.onOpenChange?.(open);
  }

  // --- keyboard -------------------------------------------------------------

  /**
   * The keys the page answers to.
   *
   *   LEFT / RIGHT (A / D)   pick a channel
   *   TAB                    the next automation target
   *   INS                    add a lane for the channel and target
   *   DEL                    remove the selected lane
   *   [ / ]                  step the selected lane
   *   UP / DOWN (W / S)      nudge the selected lane's value by 5
   *   , / .                  move the selected lane a bar left / right
   *   ; / '                  shorten / lengthen the selected lane's end
   *   SPACE                  play / stop
   *   ESCAPE                 back to the tracker
   */
  handleKey(e: KeyboardEvent): void {
    const tracks = Math.max(1, this.handlers.trackCount());
    const current = Math.max(0, Math.min(tracks - 1, this.handlers.selectedChannel()));
    const song = this.handlers.song();
    const bars = timelineBarCount(song.order.length);

    switch (e.code) {
      case 'Escape':
        e.preventDefault();
        this.handlers.close();
        return;
      case 'Tab':
        e.preventDefault();
        this.cycleTarget(e.shiftKey ? -1 : 1);
        return;
      case 'ArrowLeft': case 'KeyA':
        e.preventDefault();
        this.handlers.select((current - 1 + tracks) % tracks);
        return;
      case 'ArrowRight': case 'KeyD':
        e.preventDefault();
        this.handlers.select((current + 1) % tracks);
        return;
      case 'KeyW': case 'ArrowUp':
        e.preventDefault();
        this.nudgeValue(5);
        return;
      case 'KeyS': case 'ArrowDown':
        e.preventDefault();
        this.nudgeValue(-5);
        return;
      case 'Insert':
        e.preventDefault();
        this.addLaneForKey();
        return;
      case 'Delete':
        e.preventDefault();
        this.removeSelected();
        return;
      case 'BracketLeft':
        e.preventDefault();
        this.stepSelection(-1);
        return;
      case 'BracketRight':
        e.preventDefault();
        this.stepSelection(1);
        return;
      case 'Comma':
        e.preventDefault();
        this.moveSelected(-1, bars);
        return;
      case 'Period':
        e.preventDefault();
        this.moveSelected(1, bars);
        return;
      case 'Semicolon':
        e.preventDefault();
        this.resizeSelected('end', -1, bars);
        return;
      case 'Quote':
        e.preventDefault();
        this.resizeSelected('end', 1, bars);
        return;
      case 'Space':
        e.preventDefault();
        this.handlers.togglePlay();
        return;
      default:
    }
  }

  /** Add a lane for the selected channel and target, and select the new one. */
  private addLaneForKey(): void {
    this.status = this.handlers.addLane(this.handlers.selectedChannel() + 1, this.target);
    this.selectedLane = this.handlers.lanes().length - 1;
    this.render();
  }

  /** Cycle the target the lane editor edits, wrapping at both ends. */
  private cycleTarget(direction: number): void {
    const at = AUTOMATION_TARGETS.findIndex((target) => target.id === this.target);
    const next = (at + direction + AUTOMATION_TARGETS.length) % AUTOMATION_TARGETS.length;
    this.target = AUTOMATION_TARGETS[next].id;
    this.selectedLane = -1;
    this.status = '';
    this.render();
  }

  /** The lanes of the selected channel and target, as indices into the song list. */
  private visibleIndices(): number[] {
    const track = this.handlers.selectedChannel() + 1;
    const indices: number[] = [];
    this.handlers.lanes().forEach((lane, index) => {
      if (lane.track === track && lane.target === this.target) indices.push(index);
    });
    return indices;
  }

  private stepSelection(direction: number): void {
    const indices = this.visibleIndices();
    if (indices.length === 0) return;
    const at = indices.indexOf(this.selectedLane);
    const next = at < 0 ? (direction > 0 ? 0 : indices.length - 1) : (at + direction + indices.length) % indices.length;
    this.selectedLane = indices[next];
    this.render();
  }

  private selectedLaneValue(): AutomationLane | null {
    const lane = this.handlers.lanes()[this.selectedLane];
    return lane ?? null;
  }

  /** Nudge the selected lane's `from` and `to` up or down together. */
  private nudgeValue(delta: number): void {
    const lane = this.selectedLaneValue();
    if (!lane) return;
    const from = clampAutomationValue(lane.target, lane.from + delta);
    const to = clampAutomationValue(lane.target, lane.to + delta);
    if (from === lane.from && to === lane.to) return;
    this.handlers.beginLaneEdit();
    this.handlers.setLane(this.selectedLane, { ...lane, from, to });
    this.status = `${AUTOMATION_TARGET_BY_ID[lane.target]?.label ?? lane.target}  ${from} -> ${to}`;
    this.render();
  }

  private moveSelected(deltaBars: number, bars: number): void {
    const lane = this.selectedLaneValue();
    if (!lane) return;
    const moved = moveLane(lane, deltaBars, bars);
    if (moved.startBar === lane.startBar && moved.endBar === lane.endBar) return;
    this.handlers.beginLaneEdit();
    this.handlers.setLane(this.selectedLane, moved);
    this.status = `BARS ${moved.startBar}-${moved.endBar}`;
    this.render();
  }

  private resizeSelected(end: 'start' | 'end', deltaBars: number, bars: number): void {
    const lane = this.selectedLaneValue();
    if (!lane) return;
    const bar = (end === 'start' ? lane.startBar : lane.endBar) + deltaBars;
    const resized = resizeLane(lane, end, bar, end === 'start' ? lane.from : lane.to, bars);
    if (resized.startBar === lane.startBar && resized.endBar === lane.endBar) return;
    this.handlers.beginLaneEdit();
    this.handlers.setLane(this.selectedLane, resized);
    this.status = `BARS ${resized.startBar}-${resized.endBar}`;
    this.render();
  }

  private removeSelected(): void {
    if (this.selectedLane < 0) return;
    this.status = this.handlers.removeLane(this.selectedLane);
    this.selectedLane = -1;
    this.render();
  }

  /**
   * Move one field of the selected lane by a step — the inspector's number boxes.
   *
   * A bar field steps by one bar through `resizeLane`, so the ends cannot cross;
   * a value field steps by five through `clampAutomationValue`, so it cannot leave
   * the target's range. Each click is one undo step, like a key press.
   */
  private stepField(field: 'startBar' | 'endBar' | 'from' | 'to', delta: number): void {
    const lane = this.selectedLaneValue();
    if (!lane) return;
    const bars = timelineBarCount(this.handlers.song().order.length);
    let next: AutomationLane;
    if (field === 'startBar') next = resizeLane(lane, 'start', lane.startBar + delta, lane.from, bars);
    else if (field === 'endBar') next = resizeLane(lane, 'end', lane.endBar + delta, lane.to, bars);
    else if (field === 'from') next = { ...lane, from: clampAutomationValue(lane.target, lane.from + delta) };
    else next = { ...lane, to: clampAutomationValue(lane.target, lane.to + delta) };
    this.handlers.beginLaneEdit();
    this.handlers.setLane(this.selectedLane, next);
    this.status = `BARS ${next.startBar}-${next.endBar}`;
    this.render();
  }

  // --- mouse ----------------------------------------------------------------

  /** Which lane the pointer is on, and whether it holds an end or the body. */
  private beginDrag(pointer: Phaser.Input.Pointer): void {
    const view = this.view;
    if (!view) return;
    const bar = timelineBarAt(pointer.x - CONTENT_X, view) + 1;
    const track = this.handlers.selectedChannel() + 1;
    const lanes = this.handlers.lanes();

    let hitIndex = -1;
    let hitEnd: 'start' | 'end' | null = null;
    let hitMove = false;
    lanes.forEach((lane, index) => {
      if (lane.track !== track || lane.target !== this.target) return;
      const x1 = CONTENT_X + timelineXAt(lane.startBar - 1, view);
      const x2 = CONTENT_X + timelineXAt(lane.endBar - 1, view) + view.barWidth;
      const y1 = laneYAtValue(lane.target, lane.from, LANE_VALUE_TOP, LANE_VALUE_H);
      const y2 = laneYAtValue(lane.target, lane.to, LANE_VALUE_TOP, LANE_VALUE_H);
      if (Math.abs(pointer.x - x1) <= GRAB && Math.abs(pointer.y - y1) <= GRAB + 2) {
        hitIndex = index;
        hitEnd = 'start';
      } else if (Math.abs(pointer.x - x2) <= GRAB && Math.abs(pointer.y - y2) <= GRAB + 2) {
        hitIndex = index;
        hitEnd = 'end';
      } else {
        // On the line itself (its value at the pointed bar), or anywhere in the
        // span at a height within a touch of it: a grab in the middle MOVES a lane.
        const at = Math.max(lane.startBar, Math.min(lane.endBar, bar));
        const onY = laneYAtValue(lane.target, laneValueBetween(lane, at), LANE_VALUE_TOP, LANE_VALUE_H);
        if (bar >= lane.startBar && bar <= lane.endBar && Math.abs(pointer.y - onY) <= GRAB) {
          hitIndex = index;
          hitMove = true;
        }
      }
    });

    if (hitIndex < 0) {
      // A miss on empty strip CLEARS the selection rather than doing nothing, so a
      // click is always a statement about what is selected.
      this.selectedLane = -1;
      this.render();
      return;
    }

    this.selectedLane = hitIndex;
    const lane = lanes[hitIndex];
    if (hitEnd || hitMove) {
      // ONE undo step for the whole drag: the scene banks it here, at the start,
      // and the moves that follow land inside it.
      this.handlers.beginLaneEdit();
    }
    if (hitEnd) this.drag = { kind: 'resize', index: hitIndex, end: hitEnd };
    else if (hitMove) this.drag = { kind: 'move', index: hitIndex, original: { ...lane }, grabBar: bar };
    this.render();
  }

  private moveDrag(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    const view = this.view;
    if (!drag || !view) return;
    const bars = timelineBarCount(this.handlers.song().order.length);
    const bar = Math.max(1, Math.min(bars, timelineBarAt(pointer.x - CONTENT_X, view) + 1));
    const value = laneValueAtY(this.target, pointer.y, LANE_VALUE_TOP, LANE_VALUE_H);

    if (drag.kind === 'resize') {
      const current = this.handlers.lanes()[drag.index];
      if (!current) return;
      const next = resizeLane(current, drag.end, bar, drag.end === 'start' ? value : current.to, bars);
      this.handlers.setLane(drag.index, next);
    } else {
      const next = moveLane(drag.original, bar - drag.grabBar, bars);
      this.handlers.setLane(drag.index, { ...next, from: drag.original.from, to: drag.original.to });
    }
    this.render();
  }

  // --- paint helpers --------------------------------------------------------

  private pushText(x: number, y: number, text: string, color: number, size = 8, originX = 0): void {
    // Into the page's own layer, so the copy is drawn ABOVE the opaque cover that
    // hides the tracker — the same reason every other menu paints through one.
    const obj = uiText(this.scene, x, y, text, { size, color, origin: { x: originX, y: 0 } });
    this.layer.add(obj);
    this.texts.push(obj);
  }

  /** Centred text inside a box, vertically and horizontally. */
  private pushCentered(r: Rect, text: string, color: number, size = 8): void {
    const px = uiPx(size);
    const obj = uiText(this.scene, Math.round(r.x + r.width / 2), Math.round(r.y + (r.height - px) / 2), text, {
      size, color, origin: { x: 0.5, y: 0 },
    });
    this.layer.add(obj);
    this.texts.push(obj);
  }

  /**
   * A framed control: a raised panel (or a recessed field) with a label, a click
   * action and a hover state. Drawn into `this.bars`, rebuilt every render like
   * every other mark on this page, so show/hide is one switch.
   */
  private control(
    id: string,
    r: Rect,
    label: string,
    onPress: () => void,
    opts: { inset?: boolean; size?: number; color?: number } = {},
  ): void {
    const c = activeColors();
    if (opts.inset) drawInset(this.bars, r, 1, c);
    else drawPanel(this.bars, r, 1, c);
    this.pushCentered(r, label, opts.color ?? c.textPrimary, opts.size ?? 8);
    if (this.hover === id) this.hoverRect = r;
    // Hover is painted by one overlay graphics, NEVER by a re-render: a zone
    // created under a still pointer fires `pointerover` at once, so redrawing the
    // whole page here would re-create the zone and spin forever.
    const zone = this.scene.add.zone(r.x, r.y, r.width, r.height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.setDepth(DEPTH_TEXT - 1);
    zone.on('pointerdown', () => onPress());
    zone.on('pointerover', () => { if (this.hover !== id) { this.hover = id; this.hoverRect = r; this.paintHover(); } });
    zone.on('pointerout', () => { if (this.hover === id) { this.hover = null; this.hoverRect = null; this.paintHover(); } });
    this.zones.push(zone);
  }

  /**
   * A number box with a step on each side: the left third goes down, the right
   * third goes up. This is how a start bar, an end bar or a value is typed without
   * a text field — every shown control does something.
   */
  private fieldControl(r: Rect, value: string, onDec: () => void, onInc: () => void): void {
    const c = activeColors();
    const enabled = value !== '\u2014';
    drawInset(this.bars, r, 1, c);
    if (enabled) {
      this.pushText(r.x + 4, r.y + 4, '\u25c0', c.textDim, 8);
      this.pushText(r.x + r.width - 4, r.y + 4, '\u25b6', c.textDim, 8, 1);
    }
    this.pushCentered(r, value, enabled ? c.textPrimary : c.textDim, 8);
    if (!enabled) return;
    const left: Rect = { x: r.x, y: r.y, width: Math.floor(r.width / 3), height: r.height };
    const right: Rect = { x: r.x + r.width - Math.floor(r.width / 3), y: r.y, width: Math.floor(r.width / 3), height: r.height };
    for (const [side, action] of [[left, onDec], [right, onInc]] as const) {
      const zone = this.scene.add.zone(side.x, side.y, side.width, side.height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      zone.setDepth(DEPTH_TEXT - 1);
      zone.on('pointerdown', () => action());
      this.zones.push(zone);
    }
  }

  // --- the paint ------------------------------------------------------------

  render(): void {
    const c = activeColors();
    const song = this.handlers.song();
    const tracks = Math.max(1, this.handlers.trackCount());
    const bars = timelineBarCount(song.order.length);
    const view = timelineView(bars, CONTENT_W);
    this.view = view;

    // Keep the selection a real lane of the channel and target on screen.
    const lanes = this.handlers.lanes();
    if (this.selectedLane >= lanes.length) this.selectedLane = lanes.length - 1;
    if (this.selectedLane >= 0) {
      const lane = lanes[this.selectedLane];
      if (!lane || lane.track !== this.handlers.selectedChannel() + 1 || lane.target !== this.target) {
        this.selectedLane = this.visibleIndices()[0] ?? -1;
      }
    }

    this.back.clear();
    this.back.fillStyle(c.ink, 1);
    this.back.fillRect(0, PAGE_TOP, CANVAS_W, PAGE_BOTTOM - PAGE_TOP);

    this.hoverRect = null;
    this.frame.clear();
    this.bars.clear();
    this.laneGfx.clear();
    for (const text of this.texts) text.destroy();
    this.texts = [];
    for (const zone of this.zones) zone.destroy();
    this.zones = [];

    drawPanel(this.frame, MAIN, 1, c);
    drawPanel(this.frame, LANE_PANEL, 1, c);
    drawPanel(this.frame, INSPECTOR, 1, c);

    // --- the timeline panel ---------------------------------------------------
    this.pushText(MAIN.x + 8, MAIN.y + 6, 'ARRANGER', c.ooze, 9);
    const patterns = song.patterns.length;
    this.pushText(CONTENT_RIGHT, MAIN.y + 7, `${bars} BAR${bars === 1 ? '' : 'S'}  \u00b7  ${patterns} PATTERN${patterns === 1 ? '' : 'S'}`, c.textDim, 8, 1);

    this.drawExportRegion(view, c);
    this.drawSectionBands(song, view, c);
    this.drawBarRow(view, c);
    this.drawPatternRow(song, view, c);
    this.drawTrackRows(song, view, tracks, c);

    // --- the lane editor ------------------------------------------------------
    this.drawLaneEditor(song, view, c);

    // --- the inspector --------------------------------------------------------
    this.drawInspector(song, bars, c);

    this.paintHover();
    this.drawPlayhead();
  }

  /** The export region, bracketed above the section bands. */
  private drawExportRegion(view: TimelineView, c: UiColors): void {
    const region = this.handlers.exportRegion();
    if (!region) return;
    const from = Math.max(1, Math.min(view.bars, region.from));
    const to = Math.max(from, Math.min(view.bars, region.to));
    const x1 = CONTENT_X + timelineXAt(from - 1, view);
    const x2 = CONTENT_X + timelineXAt(to - 1, view) + view.barWidth;
    this.bars.fillStyle(c.ward, 0.9);
    this.bars.fillRect(x1, EXPORT_Y, x2 - x1, 1);
    this.bars.fillRect(x1, EXPORT_Y, 1, 4);
    this.bars.fillRect(x2 - 1, EXPORT_Y, 1, 4);
    this.pushText(Math.round((x1 + x2) / 2), EXPORT_Y - 8, `EXPORT ${String(from).padStart(2, '0')}-${String(to).padStart(2, '0')}`, c.ward, 8, 0.5);
  }

  /** The section bands: the section each run of bars came from, named and spanned. */
  private drawSectionBands(song: Song, view: TimelineView, c: UiColors): void {
    const labels = orderSectionLabels(song.order, song.sections, song.arrangement);
    const names = song.sections.map((section) => section.name);
    let at = 0;
    while (at < view.bars) {
      const name = labels[at] ?? null;
      let end = at;
      while (end + 1 < view.bars && (labels[end + 1] ?? null) === name) end += 1;
      const x = CONTENT_X + timelineXAt(at, view);
      const width = (end - at + 1) * view.barWidth - 1;
      if (name !== null) {
        const color = sectionColor(Math.max(0, names.indexOf(name)), c);
        this.bars.fillStyle(color, 0.22);
        this.bars.fillRect(x, SECTION_Y, width, SECTION_H - 1);
        this.bars.fillStyle(color, 0.95);
        this.bars.fillRect(x, SECTION_Y, width, 1);
        const label = `${name}  (${String(at + 1).padStart(2, '0')}-${String(end + 1).padStart(2, '0')})`;
        if (width > 40) this.pushCentered({ x, y: SECTION_Y + 1, width, height: SECTION_H - 2 }, label, color, 8);
      } else {
        this.bars.fillStyle(c.textDim, 0.12);
        this.bars.fillRect(x, SECTION_Y + 5, width, SECTION_H - 7);
      }
      at = end + 1;
    }
  }

  private drawBarRow(view: TimelineView, c: UiColors): void {
    this.pushText(MAIN.x + 8, BAR_Y + 2, 'BAR', c.textDim, 8);
    for (let bar = 0; bar < view.bars; bar++) {
      const x = CONTENT_X + timelineXAt(bar, view);
      const n = String(bar + 1).padStart(2, '0');
      this.pushText(x + Math.round(view.barWidth / 2), BAR_Y + 2, n, bar === this.playBar ? c.ward : c.textDim, 8, 0.5);
      this.bars.fillStyle(c.textDim, 0.14);
      this.bars.fillRect(x, BAR_Y, 1, HEAD_H);
    }
    this.bars.fillStyle(c.textDim, 0.25);
    this.bars.fillRect(CONTENT_X, BAR_Y + HEAD_H, view.visible * view.barWidth, 1);
  }

  private drawPatternRow(song: Song, view: TimelineView, c: UiColors): void {
    this.pushText(MAIN.x + 8, PATTERN_Y + 2, 'PATTERN', c.textDim, 8);
    for (let bar = 0; bar < view.bars; bar++) {
      const x = CONTENT_X + timelineXAt(bar, view);
      const n = song.order[bar] ?? 0;
      this.pushText(x + Math.round(view.barWidth / 2), PATTERN_Y + 2, `P${n}`, c.textDim, 8, 0.5);
      this.bars.fillStyle(c.textDim, 0.14);
      this.bars.fillRect(x, PATTERN_Y, 1, HEAD_H);
    }
    this.bars.fillStyle(c.textDim, 0.25);
    this.bars.fillRect(CONTENT_X, PATTERN_Y + HEAD_H, view.visible * view.barWidth, 1);
  }

  /** One row per channel: its colour, name, sound and its blocks across the form. */
  private drawTrackRows(song: Song, view: TimelineView, tracks: number, c: UiColors): void {
    const rowH = Math.max(12, Math.floor((TRACKS_BOTTOM - TRACKS_TOP) / tracks));
    const selected = Math.max(0, Math.min(tracks - 1, this.handlers.selectedChannel()));

    for (let index = 0; index < tracks; index++) {
      const y = TRACKS_TOP + index * rowH;
      const color = trackColor(index, c);
      const track = song.tracks[index];
      const name = (track?.name ?? `CH ${index + 1}`).slice(0, 12);
      const voice = track ? voiceNameFor(track.voice) : '';
      const isSelected = index === selected;

      if (isSelected) {
        this.bars.fillStyle(color, 0.14);
        this.bars.fillRect(MAIN.x + 2, y, MAIN.width - 4, rowH - 1);
      }
      // The gutter: the channel's colour, its name, and the sound it is set to.
      this.bars.fillStyle(color, 0.95);
      this.bars.fillRect(MAIN.x + 6, y + 3, 11, rowH - 8);
      this.pushText(MAIN.x + 22, y + 2, name, isSelected ? c.textPrimary : c.textDim, 8);
      if (voice !== '' && rowH >= 16) {
        this.pushText(MAIN.x + 22, y + rowH - 9, voice.toUpperCase(), c.textDim, 8);
      }

      this.drawTrackBlocks(song, view, index, y, rowH, color, c);

      // A row click selects that channel — the same selection the tracker uses.
      const zone = this.scene.add.zone(MAIN.x + 2, y, MAIN.width - 4, rowH).setOrigin(0, 0).setInteractive();
      zone.setDepth(DEPTH_TEXT - 1);
      zone.on('pointerdown', () => this.handlers.select(index));
      this.zones.push(zone);
    }

    this.bars.fillStyle(c.textDim, 0.14);
    this.bars.fillRect(MAIN.x + 2, TRACKS_BOTTOM, MAIN.width - 4, 1);
  }

  /** One channel's row: a block per bar, with its notes drawn inside it. */
  private drawTrackBlocks(
    song: Song,
    view: TimelineView,
    track: number,
    y: number,
    rowH: number,
    color: number,
    c: UiColors,
  ): void {
    const innerH = rowH - 5;
    for (let bar = 0; bar < view.bars; bar++) {
      const x = CONTENT_X + timelineXAt(bar, view);
      const w = view.barWidth;
      const boxX = x + 1;
      const boxW = Math.max(1, w - 2);
      const notes = channelBarPreview(song, bar, track);

      if (notes.length === 0) {
        // The REST state: a faint well with a couple of dashes and, when there is
        // room, the word itself — a bar a channel sits out reads as a rest.
        this.bars.fillStyle(c.ink, 0.5);
        this.bars.fillRect(boxX, y + 2, boxW, innerH);
        this.bars.fillStyle(c.textDim, 0.35);
        this.bars.fillRect(boxX + 3, y + Math.round(innerH / 2) + 1, Math.max(2, boxW - 6), 1);
        if (w >= 26) this.pushCentered({ x: boxX, y: y + 3, width: boxW, height: innerH }, 'REST', c.textDim, 8);
        continue;
      }

      this.bars.fillStyle(color, 0.16);
      this.bars.fillRect(boxX, y + 2, boxW, innerH);
      this.bars.fillStyle(color, 0.55);
      this.bars.fillRect(boxX, y + 2, boxW, 1);
      this.bars.fillRect(boxX, y + 2 + innerH - 1, boxW, 1);
      this.bars.fillRect(boxX, y + 2, 1, innerH);
      this.bars.fillRect(boxX + boxW - 1, y + 2, 1, innerH);

      if (w >= 20) this.pushText(boxX + 3, y + 3, `P${song.order[bar] ?? 0}`, color, 8);

      // The note preview: a dash per note, placed by step across the bar and by
      // pitch up the block, so the block shows the tune's shape as well as its density.
      const steps = Math.max(1, song.patterns[(song.order[bar] ?? 1) - 1]?.steps.length ?? 1);
      const usable = Math.max(2, boxW - 6);
      for (const note of notes) {
        const px = boxX + 3 + Math.round(((note.step + 0.5) / steps) * usable);
        const frac = Math.max(0, Math.min(1, (note.pitch - 36) / 48));
        const py = y + 3 + Math.round((1 - frac) * (innerH - 6));
        this.bars.fillStyle(color, 0.95);
        this.bars.fillRect(Math.max(boxX + 1, Math.min(boxX + boxW - 4, px)), py, 3, 1);
      }
    }
  }

  /** The lane editor: the value axis, the grid, and the lane's line and handles. */
  private drawLaneEditor(song: Song, view: TimelineView, c: UiColors): void {
    const info = AUTOMATION_TARGET_BY_ID[this.target];
    const track = this.handlers.selectedChannel() + 1;
    const trackName = (song.tracks[this.handlers.selectedChannel()]?.name ?? `CH ${track}`).slice(0, 12);
    const g = this.laneGfx;

    // The title row, and the + LANE control at its right.
    this.pushText(LANE_PANEL.x + 8, LANE_TITLE_Y, 'AUTOMATION', c.ooze, 8);
    this.pushText(LANE_PANEL.x + 68, LANE_TITLE_Y, `\u00b7  ${trackName}  \u00b7  ${(info?.label ?? this.target).toUpperCase()}`, c.textPrimary, 8);
    const addR: Rect = { x: LANE_PANEL.x + LANE_PANEL.width - 62, y: LANE_TITLE_Y - 2, width: 54, height: 13 };
    this.control('add-lane', addR, '+ LANE', () => this.addLaneForKey(), { size: 8 });

    // The value area: a recessed well with the grid drawn on the shared bar axis.
    const area: Rect = { x: CONTENT_X, y: LANE_VALUE_TOP, width: view.visible * view.barWidth, height: LANE_VALUE_H };
    drawInset(g, area, 1, c);

    this.pushText(MAIN.x + 8, LANE_VALUE_TOP - 1, String(info?.max ?? 100), c.textDim, 8);
    this.pushText(MAIN.x + 8, LANE_VALUE_TOP + Math.round(LANE_VALUE_H / 2) - 2, String(Math.round(((info?.max ?? 100) + (info?.min ?? 0)) / 2)), c.textDim, 8);
    this.pushText(MAIN.x + 8, LANE_VALUE_BOTTOM - 6, String(info?.min ?? 0), c.textDim, 8);

    for (const value of [info?.max ?? 100, Math.round(((info?.max ?? 100) + (info?.min ?? 0)) / 2), info?.min ?? 0]) {
      const gy = laneYAtValue(this.target, value, LANE_VALUE_TOP, LANE_VALUE_H);
      g.fillStyle(c.textDim, 0.2);
      g.fillRect(CONTENT_X, Math.round(gy), view.visible * view.barWidth, 1);
    }
    for (let bar = 0; bar < view.bars; bar++) {
      const x = CONTENT_X + timelineXAt(bar, view);
      g.fillStyle(c.textDim, 0.12);
      g.fillRect(x, LANE_VALUE_TOP, 1, LANE_VALUE_H);
    }

    let drawn = 0;
    this.handlers.lanes().forEach((lane, index) => {
      if (lane.track !== track || lane.target !== this.target) return;
      drawn += 1;
      const isSelected = index === this.selectedLane;
      const color = isSelected ? c.ward : c.ooze;
      const x1 = CONTENT_X + timelineXAt(lane.startBar - 1, view);
      const x2 = CONTENT_X + timelineXAt(lane.endBar - 1, view) + view.barWidth;
      const right = CONTENT_X + view.visible * view.barWidth;
      const y1 = laneYAtValue(lane.target, lane.from, LANE_VALUE_TOP, LANE_VALUE_H);
      const y2 = laneYAtValue(lane.target, lane.to, LANE_VALUE_TOP, LANE_VALUE_H);

      // The area under the line, so a rise reads as a shape and not just a stroke.
      g.fillStyle(color, isSelected ? 0.16 : 0.08);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.lineTo(right, y2);
      g.lineTo(right, LANE_VALUE_BOTTOM);
      g.lineTo(x1, LANE_VALUE_BOTTOM);
      g.closePath();
      g.fillPath();

      g.lineStyle(isSelected ? 2 : 1, color, isSelected ? 0.95 : 0.6);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.lineTo(right, y2);
      g.strokePath();

      g.fillStyle(c.ink, 1);
      g.fillRect(x1 - 4, y1 - 4, 8, 8);
      g.fillRect(x2 - 4, y2 - 4, 8, 8);
      g.fillStyle(color, 1);
      g.fillRect(x1 - 3, y1 - 3, 6, 6);
      g.fillRect(x2 - 3, y2 - 3, 6, 6);
    });

    // The footer: what the last edit said, or how to make a lane.
    const picked = this.handlers.lanes()[this.selectedLane];
    const note = picked
      ? `${(AUTOMATION_TARGET_BY_ID[picked.target]?.label ?? picked.target).toUpperCase()}  ${picked.from} -> ${picked.to}  \u00b7  BARS ${picked.startBar}-${picked.endBar}`
      : this.status !== ''
        ? this.status
        : drawn === 0
          ? 'INS OR + LANE ADDS ONE'
          : `${drawn} LANE${drawn === 1 ? '' : 'S'}  \u00b7  [ ] PICK  \u00b7  DEL REMOVE`;
    this.pushText(MAIN.x + 8, LANE_VALUE_BOTTOM + 3, note.length > 32 ? `${note.slice(0, 31)}…` : note, drawn === 0 && !picked ? c.textDim : c.textPrimary, 8);
    this.pushText(CONTENT_RIGHT, LANE_VALUE_BOTTOM + 3, HINT, c.textDim, 8, 1);
    this.pushText(addR.x - 8, LANE_TITLE_Y, this.handlers.playing() ? 'PLAYING' : 'STOPPED', c.textDim, 8, 1);
  }

  /** The inspector: the selected lane's channel, target and four numbers, plus actions. */
  private drawInspector(song: Song, bars: number, c: UiColors): void {
    const channel = this.handlers.selectedChannel();
    const track = channel + 1;
    const color = trackColor(channel, c);
    const name = (song.tracks[channel]?.name ?? `CH ${track}`).slice(0, 12);
    const lane = this.selectedLaneValue();
    const info = AUTOMATION_TARGET_BY_ID[this.target];

    this.pushText(INS_X, INSPECTOR.y + 6, 'THIS AUTOMATION', c.ooze, 8);

    // The channel: its colour chip, its name and its number.
    this.bars.fillStyle(color, 0.95);
    this.bars.fillRect(INS_X, INSPECTOR.y + 22, 11, 11);
    this.pushText(INS_X + 16, INSPECTOR.y + 22, name, c.textPrimary, 8);
    this.pushText(INS_X + 16, INSPECTOR.y + 32, `/  CH ${track}`, c.textDim, 8);

    // The target, with a step on each side — the same word the lane editor shows.
    const targetY = INSPECTOR.y + 50;
    this.control('target-prev', { x: INS_X, y: targetY, width: 22, height: 15 }, '\u003c', () => this.cycleTarget(-1), { size: 8 });
    this.control('target-next', { x: INS_X + INS_W - 22, y: targetY, width: 22, height: 15 }, '\u003e', () => this.cycleTarget(1), { size: 8 });
    this.control('target-name', { x: INS_X + 26, y: targetY, width: INS_W - 52, height: 15 }, (info?.label ?? this.target).toUpperCase(), () => this.cycleTarget(1), { inset: true, size: 8 });
    if (info) this.pushCentered({ x: INS_X, y: targetY + 18, width: INS_W, height: 10 }, `${info.low}  ->  ${info.high}`, c.textDim, 8);

    // The lane's own numbers. No selected lane means dashes and inert boxes.
    const value = (n: number | undefined) => (n === undefined ? '\u2014' : String(n));
    const fieldY = targetY + 34;
    const rowH = 19;
    const label = (row: number, text: string) => this.pushText(INS_X, fieldY + row * rowH + 4, text, c.textDim, 8);
    const box = (row: number): Rect => ({ x: INS_X + INS_W - 54, y: fieldY + row * rowH, width: 54, height: 15 });
    label(0, 'START BAR');
    this.fieldControl(box(0), value(lane?.startBar), () => this.stepField('startBar', -1), () => this.stepField('startBar', 1));
    label(1, 'END BAR');
    this.fieldControl(box(1), value(lane?.endBar), () => this.stepField('endBar', -1), () => this.stepField('endBar', 1));
    label(2, 'FROM');
    this.fieldControl(box(2), value(lane?.from), () => this.stepField('from', -5), () => this.stepField('from', 5));
    label(3, 'TO');
    this.fieldControl(box(3), value(lane?.to), () => this.stepField('to', -5), () => this.stepField('to', 5));

    // What the lane does after its last bar — the rule the model plays by.
    const holdY = fieldY + 4 * rowH + 4;
    const hold = lane
      ? lane.endBar < bars
        ? `Holds at ${lane.to} after bar ${lane.endBar}.`
        : `Holds at ${lane.to} to the end.`
      : 'No lane for this target yet.';
    this.pushBody(INS_X, holdY, hold, c.textDim, 8, INS_W);

    // Which lane of this target is selected.
    const actionY = holdY + 30;
    const halfW = Math.floor((INS_W - 4) / 2);
    this.control('lane-prev', { x: INS_X, y: actionY, width: halfW, height: 15 }, '\u003c PREV', () => this.stepSelection(-1), { size: 8 });
    this.control('lane-next', { x: INS_X + halfW + 4, y: actionY, width: halfW, height: 15 }, 'NEXT \u003e', () => this.stepSelection(1), { size: 8 });
    this.control('lane-add', { x: INS_X, y: actionY + 19, width: halfW, height: 15 }, '+ ADD LANE', () => this.addLaneForKey(), { size: 8 });
    this.control('lane-remove', { x: INS_X + halfW + 4, y: actionY + 19, width: halfW, height: 15 }, 'REMOVE LANE', () => this.removeSelected(), { size: 8 });

    // How to read the grid — the panel's own quiet instructions.
    const readY = actionY + 42;
    this.bars.fillStyle(c.textDim, 0.4);
    this.bars.fillRect(INS_X, readY - 6, INS_W, 1);
    this.pushText(INS_X, readY, 'READING THE SONG', c.ooze, 8);
    this.pushBody(INS_X, readY + 13, 'Each column is one bar playing one pattern across every track. The lane below shapes the selected channel.', c.textDim, 8, INS_W);
  }

  /** The hover outline, drawn on its own layer so hovering never rebuilds a zone. */
  private paintHover(): void {
    const g = this.hoverGfx;
    g.clear();
    const r = this.hoverRect;
    if (!r) return;
    const c = activeColors();
    g.lineStyle(1, c.ward, 0.9);
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1);
  }

  /** A dim, word-wrapped paragraph — the inspector's explanatory copy. */
  private pushBody(x: number, y: number, text: string, color: number, size: number, width: number): void {
    const obj = uiText(this.scene, x, y, text, { size, color, wordWrapWidth: width });
    this.layer.add(obj);
    this.texts.push(obj);
  }

  // --- the playhead ---------------------------------------------------------

  /**
   * Move the playhead. Called once per song BAR while the transport runs, and on
   * the base layer only — a full `render` would rebuild every zone and text on
   * each bar, which is neither needed nor kind to a click that is in flight.
   */
  setPlayhead(bar: number): void {
    if (bar === this.playBar) return;
    this.playBar = bar;
    this.drawPlayhead();
  }

  private drawPlayhead(): void {
    const g = this.playGfx;
    g.clear();
    const view = this.view;
    if (!view || this.playBar < 0 || this.playBar >= view.bars) return;
    const c = activeColors();
    const x = CONTENT_X + timelineXAt(this.playBar, view);
    const top = SECTION_Y;
    const bottom = LANE_VALUE_BOTTOM;
    // The current bar's column, tinted down the whole grid — including the BAR
    // row, so the number over the line is visibly the bar that is playing.
    g.fillStyle(c.ward, 0.14);
    g.fillRect(x, top, view.barWidth, bottom - top);
    g.fillStyle(c.ward, 0.9);
    g.fillRect(x, top, 1, bottom - top);
    g.fillRect(x + view.barWidth - 1, top, 1, bottom - top);
  }

  destroy(): void {
    this.unsubscribe();
    this.scene.input.off('pointermove', this.onPointerMove);
    this.scene.input.off('pointerup', this.onPointerUp);
    for (const text of this.texts) text.destroy();
    for (const zone of this.zones) zone.destroy();
    this.back.destroy();
    this.frame.destroy();
    this.bars.destroy();
    this.laneGfx.destroy();
    this.playGfx.destroy();
    this.hoverGfx.destroy();
    this.layer.destroy();
    this.curtain.destroy();
    this.laneZone.destroy();
  }
}

/** The value a lane is at on one bar, for hit-testing its body. */
function laneValueBetween(lane: AutomationLane, bar: number): number {
  if (lane.endBar <= lane.startBar) return lane.from;
  const t = (bar - lane.startBar) / (lane.endBar - lane.startBar);
  return lane.from + (lane.to - lane.from) * Math.max(0, Math.min(1, t));
}
