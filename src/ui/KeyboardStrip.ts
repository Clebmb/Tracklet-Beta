import type Phaser from 'phaser';
import {
  activeColors,
  Button,
  luminance,
  mix,
  onThemeChanged,
  uiText,
  type Rect,
} from 'phaser-ui-canvas';
import {
  baseMidiForOctave,
  chordShortName,
  DEFAULT_KEY,
  diatonicChord,
  isInKey,
  keyForSemitone,
  midiToNoteName,
  pianoKeys,
  sameKey,
  type SongKey,
} from '../model';
import { trackColor } from './trackColor';

/**
 * KeyboardStrip — a real, labelled, CLICKABLE piano along the bottom.
 *
 * This is the component that makes Tracklet legible to someone who has never
 * seen a tracker. A tracker's whole interface is the sentence "press Z to write
 * a C" — which is meaningless until you can see which key is which note. So the
 * piano draws every one of the 24 keyboard notes with two labels: the computer
 * key that types it, and the note it writes. Beginners read it, and then stop
 * needing it.
 *
 * It is also fully playable with the mouse, so a track can be written without
 * ever touching the keyboard.
 *
 * And it plays back: while the song runs, the keys LIGHT UP as they sound, in
 * their track's colour — the same colour that track's notes wear in the grid.
 * A melody you can watch is a melody you can learn from.
 *
 * It also shows the song's KEY, which is the closest thing this app has to a
 * teacher. The notes that belong to the key are drawn normally and the ones that
 * do not are dimmed toward the background, with the tonic marked; so a beginner
 * who has never heard of a scale can still see, at a glance, the seven notes a
 * song is built from. Nothing is blocked: an out-of-key key is duller, not
 * disabled, and a lit key always shows its track's colour whatever the key says.
 *
 * And in CHORD mode it becomes a chart of the song's harmony: each key's label
 * stops naming the note and starts naming the CHORD that key would write (`D`,
 * `Dm`, `G#o7`), so the seven chords of the key are laid out in front of the
 * player, spelled the way a chord symbol is spelled. That is the whole theory of
 * a key — which note is which chord — delivered without a word of explanation.
 *
 * Layout note: the zones and the labels are built once and only their contents
 * change, because rebuilding hit regions on hover is how a component eats the
 * click that was about to land on it.
 */

export interface KeyboardStripHandlers {
  /** A key was clicked: write this note. */
  onKeyPress?: (midi: number) => void;
  onOctaveDown?: () => void;
  onOctaveUp?: () => void;
}

interface KeyboardStripOptions {
  octave: number;
  /** The song's key, so the strip can show which notes belong to it. */
  key?: SongKey;
}

const CONTROL_W = 52;
const CONTROL_GAP = 6;
const KEY_GAP = 8;
const BTN_W = 23;
const BTN_H = 16;

interface KeyLabels {
  note: Phaser.GameObjects.Text;
  key: Phaser.GameObjects.Text;
  white: boolean;
  midi: number;
  x: number;
  y: number;
}

export class KeyboardStrip {
  readonly container: Phaser.GameObjects.Container;

  private readonly scene: Phaser.Scene;
  private readonly rect: Rect;
  private readonly handlers: KeyboardStripHandlers;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly labelsLayer: Phaser.GameObjects.Container;
  private readonly keyArea: Rect;

  private octave: number;
  private key: SongKey;
  private keys: ReturnType<typeof pianoKeys> = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private labels: KeyLabels[] = [];

  private hovered: number | null = null;
  private cursorMidi: number | null = null;
  private sounding = new Map<number, number>();
  /** 0 = name the note; 3 or 4 = name the chord the key writes. */
  private chordDegrees = 0;

  private readonly octaveLabel: Phaser.GameObjects.Text;
  private readonly octaveMinus: Button;
  private readonly octavePlus: Button;
  private unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    rect: Rect,
    handlers: KeyboardStripHandlers,
    options: KeyboardStripOptions,
  ) {
    this.scene = scene;
    this.rect = rect;
    this.handlers = handlers;
    this.octave = options.octave;
    this.key = options.key ? { ...options.key } : { ...DEFAULT_KEY };

    this.keyArea = {
      x: rect.x + CONTROL_W + CONTROL_GAP,
      y: rect.y,
      width: Math.max(1, rect.width - CONTROL_W - CONTROL_GAP),
      height: rect.height,
    };

    this.container = scene.add.container(rect.x, rect.y);
    this.gfx = scene.add.graphics();
    this.labelsLayer = scene.add.container(0, 0);
    this.container.add([this.gfx, this.labelsLayer]);

    this.octaveLabel = uiText(scene, rect.x, rect.y + 1, '', { size: 8 });
    this.octaveMinus = new Button(scene, { x: rect.x, y: rect.y + rect.height - BTN_H, width: BTN_W, height: BTN_H }, '-', { size: 8 });
    this.octaveMinus.onPress = () => handlers.onOctaveDown?.();
    this.octavePlus = new Button(scene, { x: rect.x + BTN_W + 4, y: rect.y + rect.height - BTN_H, width: BTN_W, height: BTN_H }, '+', { size: 8 });
    this.octavePlus.onPress = () => handlers.onOctaveUp?.();

    this.buildZones();
    this.buildLabels();
    this.repaint();

    this.unsubscribe = onThemeChanged(() => {
      this.buildLabels();
      this.repaint();
    });
  }

  /** The y of a key's top edge in the strip's own container space. */
  private get originX(): number { return this.keyArea.x - this.rect.x; }
  private get originY(): number { return this.keyArea.y - this.rect.y; }

  private layout(): void {
    this.keys = pianoKeys(this.keyArea.width, this.keyArea.height, baseMidiForOctave(this.octave), {
      octaveGap: KEY_GAP,
    });
  }

  /**
   * Hit regions are built exactly once per geometry, never per hover: a rebuild
   * destroys the very zone under the pointer, which is what silently breaks the
   * click that follows.
   */
  private buildZones(): void {
    for (const zone of this.zones) zone.destroy();
    this.zones = [];
    this.layout();
    this.keys.forEach((key, index) => {
      const zone = this.scene.add.zone(this.originX + key.rect.x, this.originY + key.rect.y, key.rect.width, key.rect.height)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        const current = this.keys[index];
        if (current) this.handlers.onKeyPress?.(current.midi);
      });
      zone.on('pointerover', () => this.setHovered(index));
      zone.on('pointerout', () => this.setHovered(null));
      this.container.add(zone);
      this.zones.push(zone);
    });
  }

  private buildLabels(): void {
    for (const label of this.labels) {
      label.note.destroy();
      label.key.destroy();
    }
    this.labels = [];
    this.keys.forEach((key) => {
      const x = this.originX + key.rect.x;
      const y = this.originY + key.rect.y;
      const cx = x + Math.round(key.rect.width / 2);
      const note = uiText(this.scene, cx, y + (key.white ? 3 : 2), this.noteTextFor(key.midi), {
        size: 8, origin: { x: 0.5, y: 0 },
      });
      const keyLabel = keyForSemitone(key.semitone) ?? '';
      const keyText = uiText(this.scene, cx, y + key.rect.height - 11, keyLabel, {
        size: 8, origin: { x: 0.5, y: 0 },
      });
      this.labelsLayer.add(note);
      this.labelsLayer.add(keyText);
      this.labels.push({ note, key: keyText, white: key.white, midi: key.midi, x, y });
    });
  }

  // --- app-facing state -----------------------------------------------------

  setOctave(octave: number): void {
    if (octave === this.octave) return;
    this.octave = octave;
    // Re-layout, not just re-label: the geometry is octave-independent but the
    // MIDI note each key writes is not, and the click handlers read those.
    this.layout();
    this.buildLabels();
    this.repaint();
  }

  /**
   * The song's key changed. Which notes are "home" is exactly what this strip
   * draws, so every key is repainted — there is nothing cheaper and nothing to
   * cache, because the dimming applies to half the strip.
   *
   * In chord mode the key decides every LABEL as well, so the labels are rebuilt
   * too; that is a few dozen Text objects on a key change, which is a click or a
   * script line, not a per-frame cost.
   */
  setKey(key: SongKey): void {
    if (sameKey(key, this.key)) return;
    this.key = { ...key };
    if (this.chordDegrees > 0) this.buildLabels();
    this.repaint();
  }

  /**
   * Enter (or leave) chord mode: 0 to name notes again, 3 or 4 to name the chord
   * each key would write. Both the labels and the dimming depend on it, so both
   * are rebuilt.
   */
  setChord(degrees: number): void {
    const next = degrees <= 0 ? 0 : Math.max(2, Math.round(degrees));
    if (next === this.chordDegrees) return;
    this.chordDegrees = next;
    this.buildLabels();
    this.repaint();
  }

  /**
   * What a key's top label says. Normally the note it writes; in chord mode the
   * CHORD it writes, because that is the thing the player is choosing — and the
   * symbol (`D`, `Dm`, `DM7`, `Do7`) is the shorthand a chord chart uses, not a
   * word invented here.
   *
   * A key whose stack has no recognisable quality falls back to its note name
   * rather than drawing a blank, so a label is never missing.
   */
  private noteTextFor(midi: number): string {
    if (this.chordDegrees <= 0) return midiToNoteName(midi);
    const short = chordShortName(diatonicChord(midi, this.key, this.chordDegrees));
    return short === '' ? midiToNoteName(midi) : short;
  }

  /** Highlight the key matching the note under the edit cursor. */
  setCursorNote(midi: number | null): void {
    if (midi === this.cursorMidi) return;
    this.cursorMidi = midi;
    this.repaint();
  }

  /** Light up the keys currently sounding, in their tracks' colours. */
  setSounding(notes: readonly { midi: number; track: number }[]): void {
    const next = new Map<number, number>();
    for (const note of notes) if (!next.has(note.midi)) next.set(note.midi, note.track);
    if (sameMap(next, this.sounding)) return;
    this.sounding = next;
    this.repaint();
  }

  private setHovered(index: number | null): void {
    const midi = index === null ? null : this.keys[index]?.midi ?? null;
    if (midi === this.hovered) return;
    this.hovered = midi;
    this.repaint();
  }

  // --- drawing --------------------------------------------------------------

  private repaint(): void {
    const c = activeColors();
    const g = this.gfx;
    g.clear();

    // A dark well behind the keys, so the group gap reads as a gap.
    g.fillStyle(c.ink, 0.55);
    g.fillRect(this.originX - 3, this.originY - 3, this.keyArea.width + 6, this.keyArea.height + 6);

    // White keys first, then black keys on top: that is also the hit order.
    for (const pass of [true, false]) {
      this.keys.forEach((key, index) => {
        if (key.white !== pass) return;
        const x = this.originX + key.rect.x;
        const y = this.originY + key.rect.y;
        const w = key.rect.width;
        const h = key.rect.height;
        const track = this.sounding.get(key.midi);
        const sounding = track !== undefined;
        const cursor = this.cursorMidi === key.midi;
        const hovered = this.hovered === key.midi;
        // In key = drawn as it always was; out of key = pulled toward the
        // background, so the seven notes that belong stand forward on their own
        // without anything being hidden or disabled.
        const inKey = isInKey(key.midi, this.key);

        let fill: number;
        if (key.white) {
          fill = inKey ? c.stoneHi : mix(c.stoneHi, c.ink, 0.45);
          if (cursor) fill = mix(fill, c.ward, 0.5);
          if (hovered) fill = mix(fill, 0xffffff, 0.18);
          if (sounding) fill = trackColor(track!, c);
          g.fillStyle(c.ink, 1);
          g.fillRect(x, y, w, h);
          g.fillStyle(fill, 1);
          g.fillRect(x + 1, y + 1, w - 2, h - 1);
          g.fillStyle(mix(fill, 0xffffff, 0.4), 1);
          g.fillRect(x + 1, y + 1, w - 2, 1);
          g.fillStyle(mix(fill, c.ink, 0.4), 1);
          g.fillRect(x + 1, y + h - 2, w - 2, 1);
        } else {
          // An out-of-key black key is painted in its own border colour, so it
          // reads as a gap rather than as a note.
          const frame = mix(c.ink, c.stone, 0.45);
          fill = inKey ? c.ink : frame;
          if (cursor) fill = mix(c.ink, c.ward, 0.7);
          if (hovered) fill = mix(fill, c.stone, 0.55);
          if (sounding) fill = trackColor(track!, c);
          g.fillStyle(frame, 1);
          g.fillRect(x, y, w, h);
          g.fillStyle(fill, 1);
          g.fillRect(x + 1, y + 1, w - 2, h - 2);
          g.fillStyle(mix(fill, 0x000000, 0.4), 1);
          g.fillRect(x + 1, y + h - 2, w - 2, 1);
        }

        // The tonic: a small ward bar at the foot of every D in D minor. It is
        // what turns "seven notes" into "seven notes, starting here".
        if (key.semitone === this.key.tonic) {
          g.fillStyle(sounding ? mix(fill, c.ink, 0.5) : c.ward, 0.95);
          g.fillRect(x + 2, y + h - 4, w - 4, 2);
        }

        this.colorLabels(index, fill, sounding, cursor, inKey);
      });
    }

    this.octaveLabel.setText(`OCT\n${this.octave}`);
    this.octaveLabel.setColor(cssOf(c.textPrimary));
  }

  /**
   * Label colour by CONTRAST with the fill the key was actually painted in, not
   * by which pass drew it: a lit key wears a track colour, which may be dark
   * (parchment's rust) or bright (reliquary's green), and the text has to survive
   * both — and now also a key dimmed for being out of key. Reading the fill makes
   * all three cases one rule instead of three special cases.
   */
  private colorLabels(index: number, fill: number, sounding: boolean, cursor: boolean, inKey: boolean): void {
    const c = activeColors();
    const label = this.labels[index];
    if (!label) return;
    let color = luminance(fill) > 0.45 ? c.ink : mix(c.stoneHi, 0xffffff, 0.3);
    // An out-of-key key whispers: its label is pulled halfway into its own fill.
    // A lit or cursored key is never muted, because what is HAPPENING beats
    // what is theoretically tidy.
    if (!inKey && !sounding && !cursor) color = mix(color, fill, 0.5);
    label.note.setColor(cssOf(color));
    label.key.setColor(cssOf(color));
  }

  destroy(): void {
    this.unsubscribe();
    for (const z of this.zones) z.destroy();
    this.octaveLabel.destroy();
    this.octaveMinus.destroy();
    this.octavePlus.destroy();
    this.container.destroy();
  }
}

function sameMap(a: ReadonlyMap<number, number>, b: ReadonlyMap<number, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

function cssOf(color: number): string {
  return '#' + (color >>> 0 & 0xffffff).toString(16).padStart(6, '0');
}
