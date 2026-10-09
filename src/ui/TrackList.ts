import type Phaser from 'phaser';
import {
  activeColors,
  onThemeChanged,
  drawInset,
  drawIcon,
  uiText,
  type Rect,
} from 'phaser-ui-canvas';
import { soundShortLabel, stackChip, type UserVoice } from '../model/instrument';
import { audible } from '../model/mix';
import { MAX_TRACK_NAME, type Track } from '../model/song';
import { RenameBox } from './RenameBox';
import { trackColor } from './trackColor';

/**
 * TrackList — the channel list beside the pattern: one row per track, the
 * selected track highlighted, a sound chip and a mute box on the right.
 *
 * A row does five things, so it has four hit regions: clicking the NAME selects
 * the track, SHIFT-clicking the name also opens the rename box, clicking
 * anywhere else on the row selects it, the chip cycles that track's WAVEFORM,
 * and the box at the very edge toggles its mute. Keeping them separate means a
 * beginner can never mute a channel, reshape its sound, or drop into a text box
 * by accident while navigating — and shift-click is the same deliberate
 * modifier that clears a cell over in the grid.
 *
 * The row also CARRIES two facts it does not edit: a level meter along its foot
 * (this channel's place in the mix, drawn in the channel's own colour) and a
 * dimming of everything in the row when the channel will not be heard — muted,
 * or held quiet by another channel's solo. Both are read from the model's
 * `audible` rather than worked out here, so the list can never dim a channel the
 * engine is still playing. Editing either one is the F5 mix menu's job, because
 * a one-click mute box and a one-click level would be one pixel apart and this
 * list is for choosing where to write.
 *
 * The rename box is a real DOM `<input>` floated over the row (see `RenameBox`,
 * shared with the header's song title), for the same reason the SCRIPT panel's
 * box is a real `<textarea>`: Phaser can draw text but cannot edit it, so an
 * in-canvas editor would be a text editor written from scratch that still could
 * not select, paste or handle an IME.
 *
 * While the input has focus the scene suspends its own keyboard handling (see
 * `onEditingChange`), or typing a name would also write notes.
 *
 * Uses the framework's painters directly rather than a generic list component:
 * a tracker channel row is its own thing (a colour chip, a name and a mute), and
 * building it from `drawInset` / `uiText` keeps it in the same visual family as
 * every panel around it.
 */

export interface TrackListHandlers {
  onSelect?: (index: number) => void;
  onToggleMute?: (index: number) => void;
  /** The waveform chip was clicked: cycle this track to the next shape. */
  onCycleWave?: (index: number) => void;
  /** A rename was committed with a usable name (already trimmed and upper-cased). */
  onRename?: (index: number, name: string) => void;
  /** The rename box opened or closed, so the scene can suspend its own input. */
  onEditingChange?: (editing: boolean) => void;
}

const ROW_H = 22;
const ROW_TOP = 2;
const BOX = 11;
/** Width of the clickable waveform chip, and the gap before the mute box. */
const WAVE_W = 24;
const WAVE_GAP = 5;
const CHIP_X = 8;
const NAME_X = 22;

export class TrackList {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly rect: Rect;
  private readonly handlers: TrackListHandlers;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Container;

  private tracks: readonly Track[] = [];
  /**
   * The sounds the user has saved, so the chip can name one.
   *
   * Handed in rather than read, because the library lives in the browser's
   * storage and this view must not know about storage — the scene owns it, the
   * way it owns the song.
   */
  private savedVoices: readonly UserVoice[] = [];
  /**
   * Which channels are being soloed, so a row can show that it is quiet.
   *
   * Handed in for the same reason the saved sounds are: solo is the scene's
   * listening state — the thing the engine is acting on — and a view must never
   * work out for itself which channels are audible, or the screen and the sound
   * could disagree.
   */
  private solos: readonly boolean[] = [];
  private selected = 0;
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private muteTexts: Phaser.GameObjects.Text[] = [];
  private waveTexts: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private muteZones: Phaser.GameObjects.Zone[] = [];
  private waveZones: Phaser.GameObjects.Zone[] = [];
  private nameZones: Phaser.GameObjects.Zone[] = [];
  private unsubscribe: () => void;

  private readonly box: RenameBox;
  private editingIndex: number | null = null;

  constructor(scene: Phaser.Scene, rect: Rect, tracks: readonly Track[], handlers: TrackListHandlers = {}) {
    this.scene = scene;
    this.rect = rect;
    this.tracks = tracks;
    this.handlers = handlers;

    this.container = scene.add.container(rect.x, rect.y);
    this.gfx = scene.add.graphics();
    this.labels = scene.add.container(0, 0);
    this.container.add([this.gfx, this.labels]);

    this.box = new RenameBox(scene, {
      rect: () => this.nameRect(this.editingIndex ?? 0),
      maxLength: MAX_TRACK_NAME,
      ariaLabel: 'Channel name',
      onCommit: (typed) => {
        const index = this.editingIndex ?? -1;
        const current = this.tracks[index]?.name;
        // Committing the same name is not an edit, so it must not cost an undo
        // step. The box compares against what it opened with; this compares
        // against the model, which is the one that decides.
        if (typed.toUpperCase() !== current) this.handlers.onRename?.(index, typed);
      },
      onEditingChange: (editing) => {
        if (!editing) this.editingIndex = null;
        this.handlers.onEditingChange?.(editing);
        this.render();
      },
    });

    this.unsubscribe = onThemeChanged(() => this.render());
    this.render();
  }

  get selectedIndex(): number { return this.selected; }

  /** True while a name is being edited, so the scene knows to keep quiet. */
  get isRenaming(): boolean { return this.editingIndex !== null; }

  setTracks(tracks: readonly Track[]): void {
    this.tracks = tracks;
    this.render();
  }

  /** Tell the chip which saved sounds exist, so a saved instrument shows by name. */
  setSavedVoices(savedVoices: readonly UserVoice[]): void {
    this.savedVoices = savedVoices;
    this.render();
  }

  /** Which channels are soloed. A row that is not one of them reads as quiet. */
  setSolos(solos: readonly boolean[]): void {
    this.solos = solos;
    this.render();
  }

  setSelected(index: number): void {
    if (index === this.selected) return;
    this.selected = index;
    this.render();
  }

  // --- geometry -------------------------------------------------------------

  /** Left edge of the waveform chip, in container-local x. */
  private get waveX(): number { return this.boxX - WAVE_GAP - WAVE_W; }
  private get boxX(): number { return this.rect.width - BOX - 4; }
  /** The clickable name area of row `i`, in WORLD coordinates. */
  private nameRect(i: number): Rect {
    const width = Math.max(24, this.waveX - NAME_X - 2);
    return { x: this.rect.x + NAME_X, y: this.rect.y + ROW_TOP + i * ROW_H, width, height: ROW_H - 2 };
  }

  // --- renaming -------------------------------------------------------------

  /** Open the rename box on a channel, selecting it first. */
  startRename(index: number): void {
    const track = this.tracks[index];
    if (!track) return;
    this.box.commit();
    this.editingIndex = index;
    this.box.recolor(activeColors());
    this.box.start(track.name);
    this.render();
  }

  /**
   * Commit an open rename immediately. The scene calls this before opening any
   * other text box, so two of them can never be fighting over the keyboard.
   */
  commitRename(): void {
    this.box.commit();
  }

  // --- drawing --------------------------------------------------------------

  render(): void {
    const c = activeColors();
    const g = this.gfx;
    g.clear();
    for (const t of this.rowTexts) t.destroy();
    for (const t of this.muteTexts) t.destroy();
    for (const t of this.waveTexts) t.destroy();
    for (const z of this.zones) z.destroy();
    for (const z of this.muteZones) z.destroy();
    for (const z of this.waveZones) z.destroy();
    for (const z of this.nameZones) z.destroy();
    this.rowTexts = [];
    this.muteTexts = [];
    this.waveTexts = [];
    this.zones = [];
    this.muteZones = [];
    this.waveZones = [];
    this.nameZones = [];

    // Whether a row is audible is THE model's question, not this view's: the mute
    // flags and solo set go to `audible`, so a row can never dim itself while the
    // engine is still playing it. The mutes are gathered once for the whole list.
    const mutes = this.tracks.map((track) => track.muted);

    this.tracks.forEach((track, i) => {
      const y = ROW_TOP + i * ROW_H;
      const selected = i === this.selected;
      const editing = i === this.editingIndex;
      const quiet = !audible(i, mutes, this.solos);

      if (selected) {
        g.fillStyle(c.ooze, 0.16);
        g.fillRect(2, y, this.rect.width - 4, ROW_H - 2);
        g.fillStyle(c.ooze, 0.9);
        g.fillRect(2, y, 2, ROW_H - 2);
      }
      if (editing) {
        // The well the DOM input sits in, so the box reads as part of the panel
        // even before the overlay has painted.
        drawInset(g, this.worldToLocal(this.nameRect(i)), 1, c);
      }

      // colour chip
      const chipY = y + Math.floor((ROW_H - 2 - 8) / 2);
      g.fillStyle(c.ink, 1);
      g.fillRect(CHIP_X, chipY, 10, 10);
      g.fillStyle(trackColor(i, c), quiet ? 0.3 : 1);
      g.fillRect(CHIP_X + 1, chipY + 1, 8, 8);

      // The name shrinks to leave room for the waveform chip and mute box, so a
      // long scripted name can never run underneath either control. While the box
      // is open the DOM input covers this text, so it is skipped entirely.
      const boxX = this.boxX;
      const boxY = y + Math.floor((ROW_H - 2 - BOX) / 2);
      const waveX = this.waveX;
      const waveY = y + Math.floor((ROW_H - 2 - 12) / 2);
      // A stacked channel wears three more characters: `+2`, meaning there IS
      // more to this sound than the chip beside it can name. It is the only
      // thing on the row that points at F7, so without it the whole layer screen
      // would be a feature nobody knows is there. The name yields the room rather
      // than the mark being dropped, so a long name can never eat it.
      const stack = stackChip(track);
      if (!editing) {
        const reserved = stack === '' ? 0 : stack.length + 1;
        const maxChars = Math.max(1, Math.floor((waveX - NAME_X - 2) / 5) - reserved);
        const name = uiText(this.scene, NAME_X, y + 8, clip(track.name, maxChars), {
          size: 8,
          color: quiet ? c.textDim : c.textPrimary,
        });
        this.labels.add(name);
        this.rowTexts.push(name);
      }
      if (stack !== '') {
        const mark = uiText(this.scene, waveX - 3, y + 8, stack, {
          size: 8,
          color: quiet ? c.textDim : c.ooze,
          origin: { x: 1, y: 0 },
        });
        this.labels.add(mark);
        this.rowTexts.push(mark);
      }

      // sound chip: a small inset showing what the channel SOUNDS like — a voice
      // name where there is one (PAD, STR, SNA), the waveform where there is not
      // (SQR, TRI, SAW, SIN). Clicking it cycles the waveform; F4 opens the whole
      // voice.
      drawInset(g, { x: waveX, y: waveY, width: WAVE_W, height: 12 }, 1, c);
      const wave = uiText(this.scene, waveX + Math.floor(WAVE_W / 2), waveY + 2, soundShortLabel(track, this.savedVoices), {
        size: 8,
        color: quiet ? c.textDim : c.ward,
        origin: { x: 0.5, y: 0 },
      });
      this.labels.add(wave);
      this.waveTexts.push(wave);

      // The level meter: a groove along the foot of the row with the channel's
      // colour filled in as far as its level. A number would say the same thing,
      // but a row of bars says WHICH CHANNEL IS LOUDER at a glance, which is the
      // question the channel list is asked about a mix. The whole row is still
      // the channel's click target, so the meter costs no interaction at all.
      const meterY = y + ROW_H - 4;
      const meterW = this.rect.width - 6;
      g.fillStyle(c.ink, 0.35);
      g.fillRect(2, meterY, meterW, 2);
      const filled = Math.round(meterW * (track.level / 100));
      if (filled > 0) {
        g.fillStyle(trackColor(i, c), quiet ? 0.3 : 0.7);
        g.fillRect(2, meterY, filled, 2);
      }

      // mute box — drawn from the FLAG, not from `quiet`: a muted channel that is
      // being soloed is audible, but its mute box is still telling the truth.
      drawInset(g, { x: boxX, y: boxY, width: BOX, height: BOX }, 1, c);
      if (track.muted) {
        drawIcon(g, 'close', boxX + Math.floor(BOX / 2), boxY + Math.floor(BOX / 2), c.danger);
      } else {
        drawIcon(g, 'dot', boxX + Math.floor(BOX / 2), boxY + Math.floor(BOX / 2), c.textGreen);
      }

      // Row zone first (behind), then the name, wave and mute zones in front, so
      // the specific controls always win the click they are under.
      const rowZone = this.scene.add.zone(0, y, this.rect.width, ROW_H)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      rowZone.on('pointerdown', () => this.handlers.onSelect?.(i));
      this.container.add(rowZone);
      this.zones.push(rowZone);

      const name = this.nameRect(i);
      const nameZone = this.scene.add.zone(name.x - this.rect.x, name.y - this.rect.y, name.width, name.height)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      nameZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        // A plain click only SELECTS, because choosing the channel to write into
        // is what a click on a name almost always means. Renaming is the
        // deliberate version: shift-click, matching the grid's shift-click.
        this.handlers.onSelect?.(i);
        if ((p.event as MouseEvent | undefined)?.shiftKey === true) this.startRename(i);
      });
      this.container.add(nameZone);
      this.nameZones.push(nameZone);

      const waveZone = this.scene.add.zone(waveX, waveY, WAVE_W, 12)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      waveZone.on('pointerdown', () => this.handlers.onCycleWave?.(i));
      this.container.add(waveZone);
      this.waveZones.push(waveZone);

      const muteZone = this.scene.add.zone(boxX - 2, boxY - 2, BOX + 4, BOX + 4)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      muteZone.on('pointerdown', () => this.handlers.onToggleMute?.(i));
      this.container.add(muteZone);
      this.muteZones.push(muteZone);
    });
  }

  /** World rect -> this container's local space, for drawing. */
  private worldToLocal(r: Rect): Rect {
    return { x: r.x - this.rect.x, y: r.y - this.rect.y, width: r.width, height: r.height };
  }

  destroy(): void {
    this.unsubscribe();
    this.editingIndex = null;
    this.box.destroy();
    this.container.destroy();
  }
}

/** Clip a channel name to a character budget, so the row stays one line. */
function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)) + '\u2026';
}
