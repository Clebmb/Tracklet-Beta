import type Phaser from 'phaser';
import {
  activeColors,
  activeTheme,
  Button,
  drawDivider,
  drawPanel,
  intToCss,
  onThemeChanged,
  uiText,
  type Rect,
} from 'phaser-ui-canvas';

import { GENRES } from '../model/genre';
import { INSTRUMENT_FILE_EXTENSION, type InstrumentRow } from '../model/instrumentLibrary';
import { MIDI_FILE_EXTENSIONS } from '../model/midi';
import { MIDI_EXPORT_FILE_EXTENSION } from '../model/midiExport';
import { PATCH_FILE_EXTENSION } from '../model/patchfile';
import { KIT_FILE_EXTENSION } from '../model/kitfile';
import {
  MAX_SAMPLES,
  MAX_SAMPLE_SECONDS,
  SAMPLE_FILE_EXTENSIONS,
  type SampleRow,
} from '../model/sample';
import { SCRIPT_FILE_EXTENSION, SONG_FILE_EXTENSION } from '../model/songfile';
import { STEM_ARCHIVE_EXTENSION, stemArchiveName } from '../model/stems';
import { SOUNDFONT_FILE_EXTENSIONS } from '../model/soundfont';
import { downloadBytes } from './download';
import { menuIntent } from './menuKeys';
import { NO_ARM, stepRemoval, type RemovalArm } from './removalArm';

/**
 * FileMenu — the F2 menu: what Tracklet does with FILES.
 *
 * The app has exactly one thing worth saving and it is the whole song, so the
 * menu is four verbs and nothing else: start over, open, save as a script, save
 * as data. Those four are here rather than on the main screen because nothing
 * on the main screen is about files, and a tracker that puts SAVE next to STOP
 * teaches a beginner to be afraid of both. Three more take a song OUT — the mix,
 * its parts and its notes — and those sit one level down, behind `EXPORT...`, on
 * a page rather than as three rows (see the frame's comment for why).
 *
 * It is drawn the way the F1 menu is drawn — a dim layer, a curtain that
 * swallows clicks, a `drawPanel` frame, pooled `uiText` — so the two menus are
 * one idea. The differences are the ones the job needs: the items are real
 * buttons (they DO something), the panel describes whichever item is
 * highlighted, and there is a status well at the bottom, because "SAVED
 * rainy-window-loop.txt" is the only proof a download happened at all.
 *
 * Two pieces of DOM live here: a hidden `<input type="file">` to pick a file
 * and a temporary `<a download>` to write one. That is not an accident — a
 * canvas cannot open a file dialog, and the framework's own rule is that a real
 * DOM control is the right answer for text and files (the SCRIPT panel's
 * textarea is the same decision). Everything around them stays canvas.
 *
 * The menu owns the plumbing, not the meaning. It reads bytes and hands them to
 * `openFile`; the scene parses them, replaces the song and says what happened.
 * Errors come back as the status line, so a bad file is visible exactly where
 * the finger that picked it is.
 */

export interface FileActionResult {
  /** The line the menu shows in its status well. */
  status: string;
  /** Optional extra lines under it: a file's diagnostics, usually. */
  details?: string[];
  /** Errors are drawn in the danger colour. */
  tone: 'ok' | 'error';
}

export interface FileMenuHandlers {
  /** The menu opened or closed, so the scene can pause its own input. */
  onOpenChange?: (open: boolean) => void;
  /** Throw the current song away and start a blank one. */
  newSong?: () => FileActionResult;
  /**
   * Open the DRUM MACHINE tab: the pad grid you draw a beat on.
   *
   * A FILE-menu row rather than a key because every `F` key is spoken for and the
   * piano owns the letters — the same reason `SCRIPT` lives on a button. This is
   * the menu's second door into it, so a person who looks for a machine where the
   * other instruments live finds one.
   */
  drumMachine?: () => FileActionResult;
  /**
   * Start from a GENRE STARTER: a whole worked skeleton, by id (`house`).
   *
   * An id rather than a script, because the menu is not the place that knows how
   * a genre is written \u2014 the model holds the skeleton as notation (`model/genre.ts`)
   * and the scene applies it through the same `applyScript` path a pasted script
   * takes, which is what makes this one undo step and keeps a starter unable to
   * mean anything the language cannot say.
   */
  startGenre?: (id: string) => FileActionResult;
  /** Take a text file the user picked, by name and contents. */
  openFile?: (name: string, text: string) => FileActionResult;
  /**
   * Take a MIDI file the user picked, by name and raw bytes.
   *
   * Bytes rather than text because a `.mid` is a BINARY format: read as text it
   * would be mangled beyond hope, so the picker hands over the buffer itself and
   * the scene's reader deals with it.
   */
  openMidi?: (name: string, bytes: ArrayBuffer) => FileActionResult;
  /**
   * Take a soundfont the user picked, by name and raw bytes.
   *
   * NOT an open: a font is an instrument the app holds, not a song, so it is
   * loaded BESIDE the song rather than replacing it. That is why it is its own
   * menu item rather than another format the picker accepts — an open that
   * silently threw the song away because the file happened to be a font would
   * be the worst kind of surprise.
   */
  openSoundFont?: (name: string, bytes: ArrayBuffer) => FileActionResult;
  /**
   * Take a `.instrument.json` the user picked, by name and text.
   *
   * Text, not bytes, because that is what the file is: a JSON document. The
   * reader wants the characters, and handing it bytes would mean decoding them
   * twice to say the same thing — unlike a soundfont or a MIDI file, whose bytes
   * ARE the content.
   *
   * Like a font, and unlike OPEN: this ADDS an instrument to the list. The song
   * is untouched and there is nothing for Ctrl+Z to take back.
   */
  openInstrument?: (name: string, text: string) => FileActionResult;
  /**
   * Take a `.wav` the user picked, by name and raw bytes.
   *
   * Bytes, not text, because a WAV's bytes ARE the sound: read as characters it
   * would be four times its own size and still not audio. Like a font, and
   * unlike OPEN: this ADDS a recording to the app's sample bank, and the song is
   * untouched \u2014 a channel that NAMES the sample is what changes, and only when
   * a line or a menu says so.
   */
  openSample?: (name: string, bytes: ArrayBuffer) => FileActionResult;
  /** The recordings currently in the bank, for the chooser page. */
  samples?: () => SampleRow[];
  /**
   * Point the channel under the cursor at a recording.
   *
   * Like `useInstrument`, this is the row that makes the page a PICKER rather
   * than a report — and unlike it, this one IS a song edit (a channel naming a
   * recording is part of the song), so it comes back as an undoable step and the
   * scene decides whether the channel can play it at all.
   */
  useSample?: (id: string) => FileActionResult;
  /**
   * Take one recording back out of the bank.
   *
   * App state, like the instrument list, so no undo step and the same two-press
   * `DEL`: a WAV you imported an hour ago may be a file you would have to find
   * again. The song is untouched — a channel naming this recording simply falls
   * back to its built-in one-shot, which is what a missing sample always means.
   */
  removeSample?: (id: string) => FileActionResult;
  /** The instruments currently in the list, for the chooser page. */
  instruments?: () => InstrumentRow[];
  /** Make one of them the instrument a `wave font` channel plays. */
  useInstrument?: (id: string) => FileActionResult;
  /**
   * Take one instrument back out of the list.
   *
   * The list is the one part of this menu that only ever GREW, so an import that
   * was a mistake — the wrong soundfont, a kit you have since replaced, a file
   * you opened to see what it was — had no way back. App state like the imports,
   * so there is no undo step and no `●`: the song is untouched either way, and
   * the file is still on disk to import again.
   */
  removeInstrument?: (id: string) => FileActionResult;
  /** The song as a Tracklet Script, for SAVE AS SCRIPT. */
  scriptText?: () => string;
  /** The song as a Tracklet song file, for SAVE AS JSON. */
  jsonText?: () => string;
  /** The file name (no extension) a save should suggest. */
  fileStem?: () => string;
  /**
   * Which bars an export will render: `THE WHOLE SONG`, `BARS 8-15`.
   *
   * A string rather than a range, because this menu SHOWS it and does not use
   * it: the scene owns the region and the two audio writers and the MIDI writer
   * all ask the scene for it. What matters here is that a person about to export
   * can see that only part of the song is going, which is the one way this
   * feature could surprise somebody.
   */
  bounceLabel?: () => string;
  /**
   * Put the export back to the whole song (the row that shows the region).
   *
   * The mouse's half of the feature: `L` in `F3` makes a region, and this takes
   * it off — the same shape as `STARTERS` and the two choosers, where a page row
   * does something to a value the page is showing.
   */
  clearBounce?: () => FileActionResult;
  /**
   * The loudness an audio export normalises to, for the LOUDNESS row: `OFF`, or
   * `-14 LUFS`.
   *
   * A LABEL and an action rather than a value and a setter, exactly as the region's
   * two are: the ladder of published targets is a rule the scene owns (`cycleLoudness`
   * in `model/loudness.ts`), and a menu that had to know which stop comes after
   * which would be a second copy of it.
   */
  loudLabel?: () => string;
  /** One press of the LOUDNESS row: the next stop up the ladder, then back to off. */
  cycleLoudness?: () => FileActionResult;
  /**
   * The whole song as a `.wav`, for EXPORT AUDIO.
   *
   * Async, because rendering a song takes longer than a click frame, and BYTES
   * rather than a file, because the one place that knows how to put a file on the
   * user's disk is this menu. An `{ error }` result is the honest failure: a
   * browser with no offline audio says so in words instead of downloading
   * something inaudible.
   */
  audioFile?: () => Promise<
    { bytes: ArrayBuffer; seconds: number; details: string[] } | { error: string }
  >;
  /**
   * One `.wav` PER CHANNEL, in a `.zip`, for EXPORT STEMS.
   *
   * Async for the reason `audioFile` is — worse, in fact, since it renders the
   * song once per channel — and in `Uint8Array` rather than `ArrayBuffer`
   * because the archive is assembled from encoded files. `names` is what the
   * status line prints, so the sentence after a stem export can name the parts
   * rather than say "four files".
   */
  stemsFile?: () => Promise<
    { bytes: Uint8Array; names: string[]; seconds: number; details: string[] } | { error: string }
  >;
  /**
   * The whole song as a `.mid`, for EXPORT MIDI.
   *
   * Bytes for the same reason `audioFile` gives them: the one place that knows
   * how to put a file on the user's disk is this menu. It is NOT a promise,
   * because writing a file of notes is arithmetic rather than a render — there is
   * nothing to wait for. An `{ error }` result is the honest failure, and the one
   * case that produces it is a song with no notes, which this app's own reader
   * would refuse to open again.
   */
  midiFile?: () => { bytes: Uint8Array; notes: number; bars: number } | { error: string };
  /**
   * The channel's sound as a patch document, for SAVE PATCH.
   *
   * TEXT rather than bytes, because a patch is a document a person can read and
   * edit: the file is the format. `detail` is the model's own one-line summary of
   * what is in it, so the status line after a save says more than a filename.
   */
  patchFile?: () => { fileName: string; text: string; detail: string } | { error: string };
  /**
   * Which channel the patch rows act on, by name — the cursor's channel.
   *
   * A name rather than a number, for the reason every row label here is a
   * sentence: a person about to overwrite a sound with somebody else's needs to
   * see WHICH sound, and `CHANNEL 3` is a number they have to count to.
   */
  patchTarget?: () => string;
  /**
   * A patch file, read and applied to the cursor's channel.
   *
   * One undo step, and the mix is left alone — see the scene's own note. Errors
   * arrive as sentences in the returned result, never as a half-applied sound.
   */
  openPatch?: (name: string, text: string) => FileActionResult;
  /**
   * The name a SAVE KIT would give the song's drums, for the row label.
   *
   * A LABEL rather than a value, exactly as `patchTarget` is: a name comes from a
   * rule (the song's title, tidied to a kit name and made usable), and a menu that
   * had to know the rule would be a second copy of it.
   */
  kitName?: () => string;
  /**
   * The song's four drum voices as a kit document, for SAVE KIT.
   *
   * TEXT, because a kit is a document a person can read and edit, the same thing
   * a patch is — and `detail` is the model's one-line summary, so the status after
   * a save says what is in it rather than only what it is called.
   */
  kitFile?: () => { fileName: string; text: string; detail: string } | { error: string };
  /**
   * A kit file, read into your kits and made the song's drums.
   *
   * The library is the app's and the kit is the song's, so this is TWO acts: the
   * file joins your kits (no undo — the library outlives the session), and the
   * song starts playing it (one undo step). Errors arrive as sentences, never as
   * a kit that half-loaded.
   */
  openKit?: (name: string, text: string) => FileActionResult;
  /**
   * What the MIDI control is doing, for the `MIDI IN:` row: `OFF`, `LISTENING`,
   * `RECORDING`, or a mode with the clock it has locked on to.
   *
   * A label rather than a value, exactly as `loudLabel` and `bounceLabel` are: the
   * three-stop cycle and the clock arithmetic are rules the scene owns, and a menu
   * that had to know them would be a second copy.
   */
  midiLabel?: () => string;
  /**
   * One press of the MIDI IN row: the next stop (off, listen, record), or off.
   *
   * Synchronous even when turning it ON means asking the browser: the row reports
   * the decision, and the scene speaks up again through the toast when the
   * permission is answered. A dialog that appeared in the middle of a menu would
   * leave this panel hanging over the app (see `openPicker`).
   */
  cycleMidi?: () => FileActionResult;
}

/** The canvas the app is drawn in. */
const CANVAS_W = 720;
const CANVAS_H = 405;

/**
 * The menu frame, in canvas coordinates.
 *
 * Grown downward from its original 280 when the instrument rows arrived — the
 * item list is TEN long, with SAMPLES beside INSTRUMENTS and the three writers
 * sharing the EXPORT page — but no further than the canvas: the hint line at the
 * bottom of the panel still has to fit above the edge, which at 405 pixels is the
 * last 40 of them.
 *
 * ── Why the later rows cost no height ──────────────────────────────────────
 * The panel cannot grow, so the row BLOCK keeps the footprint it had, and each
 * time the list grew the rows got tighter instead: ten of them start 90 pixels
 * down, step 20 and are 17 tall, ending at 287 \u2014 and the rule, the status
 * block and the hint line all stay where they were (status at 324, its last line
 * at 355, the hint at 358). Eleven is the ceiling: the next row would need a step
 * of 18, which is thinner than the label it holds.
 *
 * ── The row that would not fit, and what it became ─────────────────────────
 * STEMS made a twelfth row, and it is the export writers that are the honest
 * thing to fold: they are the rarest acts in this menu \u2014 nowhere near NEW SONG
 * or SAVE \u2014 and three writers on one page is also where a person looks for a
 * format they have not used yet. So `EXPORT...` opens the EXPORT page and the
 * three live there, which is what STARTERS and the two choosers already do one
 * question along.
 */
const MODAL: Rect = { x: 80, y: 74, width: 560, height: 330 };

/** Render depths: dim < curtain < frame < text and buttons. Above the toast at 950. */
const DEPTH_DIM = 960;
const DEPTH_CURTAIN = 962;
const DEPTH_FRAME = 970;
const DEPTH_FRONT = 980;

/** The item column, and the description column beside it. */
const ITEM_W = 236;
const DESC_X = MODAL.x + 252;
const DESC_W = MODAL.width - 252 - 4;

/** One item's row height and the air between rows. */
const ITEM_H = 16;
const ITEM_STEP = 19;
/** Where the first item sits. */
const ITEM_TOP = 90;

/** The first status line; the label sits one gap above it. */
const STATUS_TOP = 324;
const MAX_STATUS_LINES = 3;
const LINE_H = 11;

/** Which theme colour a piece of copy wears, so a recolour can find it. */
type TextRole = 'heading' | 'body' | 'accent' | 'dim';

interface StaticText {
  obj: Phaser.GameObjects.Text;
  role: TextRole;
}

/** One thing the menu can do, as DATA: a label, an explanation, and an action. */
interface FileItem {
  label: string;
  description: string;
  run: () => void;
}

/**
 * Which list of items the panel is showing.
 *
 * `file` is the menu; `instruments` and `samples` are the two choosers, which
 * are PAGES rather than second windows because each is the same question asked
 * one level down ("which file?" → "which of the recordings those files gave
 * me?"), and because a menu that swaps its own rows keeps the whole thing in one
 * place the user is already looking at.
 *
 * They are two pages and not one list because they answer different questions:
 * an instrument is what a WHOLE CHANNEL sounds like (`wave font`), and a
 * recording is one file a channel may NAME (`wave sample`). A single "sounds"
 * page would put the two in one column and make "press ENTER" mean two
 * different things.
 */
/**
 * Which page the panel is showing \u2014 see `FilePage` above.
 *
 * `starters` is here for the same reason the two choosers are, one step earlier:
 * it is the "which song?" question asked before there is a song. It is a page
 * rather than a modal so that NEW SONG keeps its row and its one click, and it
 * lists STARTERS only \u2014 the blank song is still the row above it.
 *
 * `export` is the page the three writers share, and the one page here that is
 * about the song LEAVING rather than arriving: what was three rows of the menu
 * until stems needed a fourth, and one row that opens three answers instead.
 *
 * ESC backs out ONE level on every page \u2014 a page returns to the menu rather
 * than closing it \u2014 which is what makes a page a shelf rather than a window.
 */
type FilePage = 'file' | 'starters' | 'export' | 'instruments' | 'samples' | 'sounds';

export class FileMenu {
  private readonly scene: Phaser.Scene;
  private readonly handlers: FileMenuHandlers;

  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly curtain: Phaser.GameObjects.Zone;
  private readonly closeButton: Button;
  private itemButtons: Button[] = [];
  private readonly staticTexts: StaticText[] = [];
  /** The panel's top line, which names the page it is showing. */
  private heading!: Phaser.GameObjects.Text;
  private page: FilePage = 'file';
  private items: FileItem[] = [];

  private description!: Phaser.GameObjects.Text;
  private descriptionText = '';
  private statusTexts: Phaser.GameObjects.Text[] = [];
  /** Kept so a theme change can repaint the status in the new palette. */
  private lastStatus: { text: string; tone: 'ok' | 'error' | 'dim'; details?: string[] } = { text: '', tone: 'dim' };

  private selected = 0;
  /**
   * The instrument a first `DEL` has marked, if any.
   *
   * The rule this holds — that the second press removes the row the FIRST press
   * was about — lives in `removalArm.ts` so it can be tested without a canvas.
   */
  private arm: RemovalArm = NO_ARM;
  private opened = false;
  private picker: HTMLInputElement | null = null;
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, handlers: FileMenuHandlers = {}) {
    this.scene = scene;
    this.handlers = handlers;

    // --- chrome --------------------------------------------------------------
    this.dim = scene.add.graphics().setDepth(DEPTH_DIM);
    this.frame = scene.add.graphics().setDepth(DEPTH_FRAME);

    // A full-screen zone in front of the app, so a stray click under the menu
    // cannot edit the song. It also dismisses the menu, because a modal you
    // cannot leave by clicking is worse than no modal.
    this.curtain = scene.add.zone(0, 0, CANVAS_W, CANVAS_H).setOrigin(0, 0).setInteractive();
    this.curtain.setDepth(DEPTH_CURTAIN);
    this.curtain.on('pointerdown', () => this.hide());

    // The page's title is its own object rather than baked into `addStatic`,
    // because its TEXT changes when the instrument chooser opens — but it still
    // goes in `staticTexts`, which is the list `setOpen` shows and hides. A title
    // that is created outside that list is a title left hanging over the app when
    // the menu is closed, and 'FILE - START OVER, OPEN, IMPORT, SAVE' sitting on
    // top of the pattern grid is the panel that will not go away.
    this.heading = uiText(scene, MODAL.x + 4, MODAL.y + 2, '', {
      size: 8, color: activeColors().textPrimary,
    });
    this.heading.setDepth(DEPTH_FRONT);
    this.staticTexts.push({ obj: this.heading, role: 'accent' });
    this.addStatic(MODAL.x + 4, STATUS_TOP - 12, 'STATUS', 'dim');
    this.addStatic(MODAL.x + 4, MODAL.y + MODAL.height - 46, 'ARROWS OR WASD MOVE  ·  ENTER OR SPACE CHOOSES  ·  ESC CLOSES', 'dim');

    // --- items ---------------------------------------------------------------
    // Built by `showPage` at the very end of the constructor, once the
    // description object it writes into exists.

    this.description = uiText(scene, DESC_X, ITEM_TOP, '', {
      size: 8, color: activeColors().textPrimary, wordWrapWidth: DESC_W,
    });
    this.description.setDepth(DEPTH_FRONT);

    this.closeButton = new Button(scene, {
      x: MODAL.x + MODAL.width - 122,
      y: MODAL.y + MODAL.height - 26,
      width: 116,
      height: 20,
    }, 'CLOSE', { size: 8, icon: 'close' });
    this.closeButton.container.setDepth(DEPTH_FRONT);
    this.closeButton.onPress = () => this.hide();

    this.unsubscribe = onThemeChanged(() => this.render());
    this.setOpen(false);
    this.showPage('file');
    this.setStatus('PICK AN ITEM, OR PRESS ESC TO GO BACK.', 'dim');
    this.render();
  }

  // --- the two pages --------------------------------------------------------

  /**
   * What the menu does with FILES: start over, open, import, save, export.
   *
   * The two IMPORT rows sit together above the two SAVE rows because they are
   * the pair a beginner confuses: IMPORT FROM NOISLET and LOAD SOUNDFONT both
   * ADD an instrument to the list and change nothing about the song, while OPEN
   * FILE replaces the song itself.
   */
  private fileItems(): FileItem[] {
    return [
      {
        label: 'NEW SONG',
        description: 'Throw this song away and start from a blank one. One Ctrl+Z brings it back.',
        run: () => this.report(this.handlers.newSong?.() ?? null),
      },
      {
        label: 'STARTERS...',
        description: 'Begin from a whole working skeleton \u2014 a key, a tempo, a feel, a kit, named channels, a drum figure, a chord loop and a form \u2014 and edit it instead of inventing it. Like NEW SONG, it REPLACES the song, and one Ctrl+Z brings back the one you had.',
        run: () => this.showPage('starters'),
      },
      {
        label: 'OPEN FILE...',
        description: `Read a ${SCRIPT_FILE_EXTENSION} Tracklet Script, a ${SONG_FILE_EXTENSION} song file or a MIDI file (${MIDI_FILE_EXTENSIONS.join(' / ')}). The file REPLACES the whole song; Ctrl+Z takes that back too.`,
        run: () => this.pickFile(),
      },
      {
        label: `IMPORT FROM NOISLET (${INSTRUMENT_FILE_EXTENSION})`,
        description: 'Read an instrument exported from Noislet \u2014 one file holding several of its sounds. This does NOT touch the song: it joins the instrument list, and a channel on `wave font` plays it.',
        run: () => this.pickInstrument(),
      },
      {
        label: `LOAD SOUNDFONT (${SOUNDFONT_FILE_EXTENSIONS.join(' ')})`,
        description: 'Read a SoundFont \u2014 a file of somebody else\u2019s recorded instruments. This does NOT touch the song: it joins the instrument list too, and Ctrl+Z never undoes it.',
        run: () => this.pickSoundFont(),
      },
      {
        label: this.instrumentCount() > 0 ? `INSTRUMENTS (${this.instrumentCount()})...` : 'INSTRUMENTS...',
        description: 'Choose which of the instruments you have imported `wave font` plays. The list is app state, not part of the song \u2014 a song says `wave font`, and this decides what that means.',
        run: () => this.showPage('instruments'),
      },
      {
        label: this.sampleCount() > 0 ? `SAMPLES (${this.sampleCount()})...` : 'SAMPLES...',
        description: 'The recordings YOU have loaded — each a `.wav` the app holds, up to 8 of them and 30 seconds each. A channel plays one by naming it (`sample BRK02` on its `track` line, on a `wave sample` layer); a song naming a recording you do not have plays its built-in sound instead, so a song still sounds on a machine that never saw the file.',
        run: () => this.showPage('samples'),
      },
      {
        label: `SAVE AS SCRIPT (${SCRIPT_FILE_EXTENSION})`,
        description: 'Write this song out as the text the SCRIPT panel takes, so it can be edited by hand, pasted back, or handed to a model. A recording is never in it: the song writes the NAME, and the audio stays in the app.',
        run: () => this.save(SCRIPT_FILE_EXTENSION, 'text/plain', () => this.handlers.scriptText?.()),
      },
      {
        label: `SAVE AS JSON (${SONG_FILE_EXTENSION})`,
        description: 'Write this song out as plain data, for a tool that would rather parse numbers than notation.',
        run: () => this.save(SONG_FILE_EXTENSION, 'application/json', () => this.handlers.jsonText?.()),
      },
      {
        label: 'DRUM MACHINE...',
        description: 'Open the drum machine: a pad for each sound against a row of steps, so a beat is drawn as a grid rather than typed as a column. The machine is part of the SONG \u2014 it saves with it, a script writes it, and a machine an old song does not have simply is not there.',
        run: () => { this.report(this.handlers.drumMachine?.() ?? null); this.hide(); },
      },
      {
        label: 'SOUND FILES...',
        description: `The two small documents that carry a SOUND: a channel\u2019s SOUND as a ${PATCH_FILE_EXTENSION} \u2014 the voice, its layers, its filter, its effects, how long its notes ring and how much of it stands in the room \u2014 and the song\u2019s DRUMS as a ${KIT_FILE_EXTENSION}. Both fit in a message, both carry nothing about the mix they came from, and both can be read back \u2014 a patch onto any channel, a kit as the drums of any song.`,
        run: () => this.showPage('sounds'),
      },
      {
        label: 'EXPORT...',
        description: 'Take the song out: the finished mix as a `.wav`, each channel on its own as a `.zip` of stems for anybody who mixes elsewhere, or the notes as a `.mid` for another program \u2014 and the way IN: a MIDI keyboard you can play, and a clock the song can follow.',
        run: () => this.showPage('export'),
      },
    ];
  }

  /**
   * The EXPORT page: the three ways a song leaves sound-alike.
   *
   * It is a PAGE rather than three rows of the menu for the reason the row block
   * cannot grow past eleven (see the frame's comment above): each of these was a
   * row, and the fourth — a loop-region bounce, a loudness pass — would have been
   * the twelfth. One row that opens this keeps the menu the length it is and puts
   * the three writers where the question "how do I get this out?" is asked, which
   * is also the one place a person looks for a format they have not used yet.
   */
  private exportItems(): FileItem[] {
    return [
      {
        label: 'EXPORT AUDIO (WAV)',
        description: 'Play the song through the app\u2019s own synth and write it out as a .wav \u2014 pan, reverb and echo included. A long song takes a moment, and only the bars the RENDER row names are written.',
        run: () => this.exportAudio(),
      },
      {
        label: `EXPORT STEMS (${STEM_ARCHIVE_EXTENSION})`,
        description: 'One .wav PER CHANNEL, zipped: the mix, taken apart for anybody who mixes somewhere else. Each file is that channel through the same synth, the same effects and the same room, so the parts add back up to the mix \u2014 and each channel is rendered on its own, so a stem export takes longer than an audio export. Only the bars the RENDER row names are written.',
        run: () => this.exportStems(),
      },
      {
        label: `EXPORT MIDI (${MIDI_EXPORT_FILE_EXTENSION})`,
        description: 'Write the song out as a MIDI file \u2014 the notes, how long they last, how hard they are hit and the tempo \u2014 for any other program to open. The sound, the effects, the pan and the feel are Tracklet\u2019s own and do not go with it. Only the bars the RENDER row names are written, and a region starts at its own bar 1 as far as the file is concerned.',
        run: () => this.exportMidi(),
      },
      {
        label: `RENDER: ${this.handlers.bounceLabel?.() ?? 'THE WHOLE SONG'}`,
        description: 'Which BARS an export renders. `THE WHOLE SONG` is everything the order plays; a region — `BARS 8-15` — renders only those bars, and you mark one in `F3` with `L`, or with `export bars 8 to 15` in a script. Press ENTER to go back to the whole song.',
        run: () => { this.report(this.handlers.clearBounce?.() ?? null); },
      },
      {
        label: `MIDI IN: ${this.handlers.midiLabel?.() ?? 'OFF'}`,
        description: 'A real keyboard \u2014 the one thing here that comes IN. Press ENTER to walk OFF, LISTENING and RECORDING. LISTENING sounds what you play on the selected channel and writes nothing; RECORDING also drops each note into the bar the playhead is on, while the song runs, as one Ctrl+Z per take. The browser asks permission the first time, and a device that sends a clock has its TEMPO followed (and its start and stop obeyed) \u2014 the row says SYNC with the tempo it locked on to.',
        run: () => { this.report(this.handlers.cycleMidi?.() ?? null); },
      },
      {
        label: `LOUDNESS: ${this.handlers.loudLabel?.() ?? 'OFF'}`,
        description: 'How LOUD an audio export arrives. `OFF` writes the level you hear; a target measures the finished render the way a streaming service does (ITU-R BS.1770) and applies the one gain that lands it there \u2014 stopping at -1 dBFS rather than clipping, and saying so when it does. Press ENTER to walk OFF, -23 broadcast, -16 podcast, -14 streaming and -9 loud, or set any value in that range with `export loud -14`. MIDI carries no level, so EXPORT MIDI ignores it.',
        run: () => { this.report(this.handlers.cycleLoudness?.() ?? null); },
      },
      {
        label: 'BACK TO THE FILE MENU',
        description: 'Back to the file menu \u2014 new, open, import, save.',
        run: () => this.showPage('file'),
      },
    ];
  }

  /**
   * The SOUND FILES page: a channel's sound and the song's drums, out and in.
   *
   * The eleventh row of the menu had to be a PAGE rather than two more rows, for
   * the reason the EXPORT page did: the row block cannot grow past eleven (see the
   * frame's comment above), and two writers on one page is also where a person
   * looks for a thing they have not used yet.
   *
   * Both PATCH rows name the TARGET channel, because the page acts on the channel
   * the cursor is in and a patch is not obviously about any particular one — the
   * whole point of the format is that a sound travels. `LOAD PATCH` says `ONTO`
   * rather than nothing for the same reason: the direction of the act is the one
   * thing a person about to press it should be sure of, since it is not undoable
   * by anything outliving the session except `Ctrl+Z`.
   *
   * The two KIT rows are the same question one scope out — a WHOLE SET of drums
   * rather than one channel — and they sit beside the patches because a kit file
   * is the same kind of thing: a small JSON document that makes a sound portable.
   * They name no channel because a kit is not about one: it is what every hit in
   * the song plays, so `SAVE KIT` names the SONG's title and `LOAD KIT` is the
   * whole song's drums in one press.
   */
  private soundItems(): FileItem[] {
    const target = this.handlers.patchTarget?.() ?? 'NO CHANNEL';
    const kit = this.handlers.kitName?.() ?? 'KIT';
    return [
      {
        label: `SAVE PATCH  ${target}`,
        description: `Write the sound of ${target} \u2014 its voice, its layers, its filter, its effects, how long its notes ring, how far they slide, and how much of it stands in the room \u2014 as one small ${PATCH_FILE_EXTENSION} document. The name comes from the CHANNEL, and the file carries nothing about the mix: no level, no pan, no group, no pocket, no part in the arrangement.`,
        run: () => this.savePatch(),
      },
      {
        label: `LOAD PATCH ONTO  ${target}...`,
        description: `Read a ${PATCH_FILE_EXTENSION} and put that sound on ${target}, as ONE undo step. Everything the patch carries is replaced and everything it does not is left exactly where it was, so a level you set, a pan you placed and a group you joined all survive somebody else\u2019s sound arriving. The audio a patch names (its recording) is the app\u2019s: one you do not have plays its built-in fallback, so a shared patch still makes a sound.`,
        run: () => this.pickPatch(),
      },
      {
        label: `SAVE KIT  ${kit}`,
        description: `Write the SONG\u2019S DRUMS \u2014 the four voices every hit plays, whichever kit they came from \u2014 as one ${KIT_FILE_EXTENSION} document, so a kit can be handed to another song or another person. The name comes from the song\u2019s TITLE (a kit has no channel to borrow one from), and what is written is the four voices AS THEY ARE, so capturing the built-in \`808\` and editing the file is a way to build on it.`,
        run: () => this.saveKit(),
      },
      {
        label: 'LOAD KIT...',
        description: `Read a ${KIT_FILE_EXTENSION} \u2014 four drum voices with a name \u2014 and make it the song\u2019s drums, as ONE undo step. It also joins YOUR KITS, so the name keeps working after the song is saved and reopened; a song naming a kit this machine does not have plays the four presets rather than refusing to open. Write \`kit ${kit}\` in a script to choose a kit \u2014 yours or one of the built-ins \u2014 without a file.`,
        run: () => this.pickKit(),
      },
      {
        label: 'BACK TO THE FILE MENU',
        description: 'Back to the file menu \u2014 new, open, import, save.',
        run: () => this.showPage('file'),
      },
    ];
  }

  /**
   * What the SAMPLES page shows: how to add one, then the bank, then the way back.
   *
   * The load row is FIRST and sits on the page rather than in the menu, which is
   * what keeps a tenth row from being needed in a panel that has no room for one:
   * the question "what have I got?" and the act of getting another are the same
   * visit. An empty bank still gets the load row plus a row that says the bank is
   * empty, because a page with nothing on it reads as broken.
   */
  private sampleItems(): FileItem[] {
    const rows = this.handlers.samples?.() ?? [];
    return [
      {
        label: `LOAD A RECORDING (${SAMPLE_FILE_EXTENSIONS.join(' ')})...`,
        description: `Read a .wav into the bank \u2014 up to ${MAX_SAMPLES} recordings of at most ${MAX_SAMPLE_SECONDS} seconds each, held for this session. This does NOT touch the song: it lands in the bank, and a channel plays it only when a \`sample NAME\` line says so. The name comes from the file name (spaces become \`-\`), and the status line prints it.`,
        run: () => this.pickSample(),
      },
      ...rows.map((row) => ({
        label: row.active ? `${row.name}  *` : row.name,
        description: `${row.meta}${row.active ? '  \u00b7  THE SELECTED CHANNEL PLAYS THIS' : '  \u00b7  press ENTER to give the selected channel this recording'}`,
        run: () => {
          // Rebuilt BEFORE the report, because the `*` moves with the pick and
          // the page is drawn from the list it is handed: a refresh after the
          // report would rub out the sentence saying what just happened.
          const result = this.handlers.useSample?.(row.id) ?? null;
          this.showPage('samples', true);
          this.report(result);
        },
      })),
      ...(rows.length === 0
        ? [{
            label: 'NOTHING LOADED YET',
            description: 'The row above reads a .wav into the bank. A song that names a recording the app does not have still plays: its channel falls back to the built-in one-shot its `duty` picks.',
            run: () => this.pickSample(),
          }]
        : []),
      {
        label: 'BACK',
        description: 'Back to the file menu. The bank is remembered for this session, like the soundfont it sits beside.',
        run: () => this.showPage('file'),
      },
    ];
  }

  /** How many recordings the bank holds, for the row's own label. */
  private sampleCount(): number {
    return this.handlers.samples?.().length ?? 0;
  }

  /**
   * What the STARTERS page shows: one row per genre, then a way back.
   *
   * Each row is a whole song rather than a setting, which is why the page lists
   * them the way an instrument list lists sounds: the label for the eye, the
   * blurb for the decision, and Enter to take it. Picking one returns to the file
   * page rather than staying here \u2014 the song BECOMES the skeleton, so the next
   * thing to do is press SPACE, and a picker left open over the song it just made
   * is a menu in the way of the playhead.
   */
  private starterItems(): FileItem[] {
    return [
      ...GENRES.map((genre) => ({
        label: genre.label,
        description: `${genre.blurb}  \u00b7  press ENTER to start from this one.`,
        run: () => {
          const result = this.handlers.startGenre?.(genre.id) ?? null;
          this.showPage('file');
          this.report(result);
        },
      })),
      {
        label: 'BACK',
        description: 'Back to the file menu. Nothing changes until you pick one: a starter begins with `new`, so the song you have is REPLACED rather than added to, and one Ctrl+Z is what takes that back.',
        run: () => this.showPage('file'),
      },
    ];
  }

  /**
   * What the chooser shows: one row per instrument, then a way back.
   *
   * Picking a row is not a song edit, so it reports but does not undo — the same
   * rule the imports follow. An empty list gets a row that says so rather than an
   * empty panel, because a menu with nothing in it reads as broken.
   */
  private instrumentItems(): FileItem[] {
    const rows = this.handlers.instruments?.() ?? [];
    if (rows.length === 0) {
      return [
        {
          label: 'NO INSTRUMENTS YET',
          description: `Import one first: an ${INSTRUMENT_FILE_EXTENSION} from Noislet, or a ${SOUNDFONT_FILE_EXTENSIONS.join(' ')} soundfont. Either one lands in this list.`,
          run: () => this.showPage('file'),
        },
        { label: 'BACK', description: 'Back to the file menu.', run: () => this.showPage('file') },
      ];
    }
    return [
      ...rows.map((row) => ({
        label: row.active ? `${row.name}  *` : row.name,
        description: `${row.meta}${row.active ? '  ·  THIS IS WHAT `wave font` PLAYS' : '  ·  press ENTER to play this one'}`,
        run: () => {
          this.report(this.handlers.useInstrument?.(row.id) ?? null);
          // Stay on the page: picking one to try another is the whole reason to
          // be here, and being thrown back to the file menu would cost a step
          // per comparison.
        },
      })),
      {
        label: 'BACK',
        description: 'Back to the file menu. Which instrument is loaded is remembered per session, like the soundfont it replaced.',
        run: () => this.showPage('file'),
      },
    ];
  }

  /** How many instruments the list holds, for the row's own label. */
  private instrumentCount(): number {
    return this.handlers.instruments?.().length ?? 0;
  }

  /**
   * Swap the item list and rebuild the rows.
   *
   * Buttons are real Phaser objects with an interactive zone, so a new page means
   * new buttons rather than relabelled ones: the labels differ in length and the
   * highlight has to reset. Cheap, because a page swap is a click.
   */
  private showPage(page: FilePage, keepSelection = false): void {
    // Leaving a chooser drops an armed removal: the arm belongs to a row on that
    // page, and a menu you walked away from should not be half-way through
    // removing something when you come back to it. (Which is why the comparison
    // happens BEFORE the assignment — the page this menu is on is the one it is
    // leaving, and reading `this.page` after writing it compares it to itself.)
    const left = page !== this.page;
    this.page = page;
    if (left) this.arm = NO_ARM;
    for (const button of this.itemButtons) button.destroy();
    this.itemButtons.length = 0;

    this.items = page === 'file'
      ? this.fileItems()
      : page === 'starters'
        ? this.starterItems()
        : page === 'export'
          ? this.exportItems()
          : page === 'sounds'
            ? this.soundItems()
            : page === 'samples'
              ? this.sampleItems()
              : this.instrumentItems();
    this.heading.setText(page === 'file'
      ? 'FILE  -  START OVER, OPEN, IMPORT, SAVE'
      : page === 'starters'
        ? 'STARTERS  -  A WHOLE SONG TO START FROM'
        : page === 'export'            ? 'EXPORT & MIDI  -  OUT AS FILES, IN AS NOTES'
          : page === 'sounds'
            ? 'SOUND FILES  -  A CHANNEL\u2019S PATCH, OR YOUR DRUMS'
            : page === 'samples'
              ? 'SAMPLES  -  THE RECORDINGS YOU LOADED'
              : 'INSTRUMENTS  -  WHAT `wave font` PLAYS');

    this.items.forEach((item, i) => {
      const button = new Button(this.scene, {
        x: MODAL.x + 4,
        y: ITEM_TOP + i * ITEM_STEP,
        width: ITEM_W,
        height: ITEM_H,
      }, item.label, { size: 8, align: 'left', icon: 'chevron-right' });
      button.container.setDepth(DEPTH_FRONT);
      button.container.setVisible(this.opened);
      button.onPress = () => item.run();
      // Hovering describes the item, so the explanation always belongs to
      // whatever the pointer or the arrows are on.
      button.onHover = (over) => { if (over) this.select(i); };
      this.itemButtons.push(button);
    });

    // Keeping the highlight is what a REMOVAL needs: deleting the third of five
    // instruments should leave you on the third of the four that are left, not
    // back at the top of a list you were reading.
    this.select(keepSelection ? Math.min(this.selected, this.items.length - 1) : 0);
    // Opening the chooser says where you are; ESC (or BACK) returns, and the
    // file page's own highlight is reset by the `select` above.
    this.pageStatus();
  }

  /** Which page is showing, for the scene and for a test. */
  /**
   * Rebuild the page on screen, keeping the highlight where it was.
   *
   * `showPage`'s cousin for a change that came from OUTSIDE the menu: the MIDI
   * row's label moves when the browser answers a permission prompt or a keyboard
   * is plugged in, and the row has to say so without the page being reopened. A
   * menu that is closed does nothing, because there is nothing on screen to
   * correct.
   */
  refreshPage(): void {
    if (!this.opened) return;
    this.showPage(this.page, true);
  }

  get showing(): FilePage {
    return this.page;
  }

  /**
   * Open the instrument picker from OUTSIDE the menu.
   *
   * The one part of this menu a script can trigger: `instrument import` means
   * "ask me for a file", and a script cannot read a path. It closes the menu
   * first because the picker is a DOM dialog, and a modal canvas panel sitting
   * behind an OS file dialog is a screen nobody can read.
   */
  openInstrumentPicker(): void {
    this.hide();
    this.pickInstrument();
  }

  /** True while the menu is up; the scene pauses itself while it is. */
  get isOpen(): boolean {
    return this.opened;
  }

  /**
   * Open the menu, refreshing its rows first.
   *
   * The rows are DATA, built once per page by `showPage`, and one of them counts
   * the instruments you have — which is precisely the thing that changes while
   * the menu is closed. Without this rebuild the count is whatever it was when
   * the app started (nothing), so the label that exists to save you a step never
   * tells you anything. The page you left on and the row you left the highlight
   * on are both kept: the only difference is that the numbers are true now.
   */
  show(): void {
    this.showPage(this.page, true);
    this.setOpen(true);
  }
  hide(): void { this.setOpen(false); }
  toggle(): void { this.setOpen(!this.opened); }

  /** Put the highlight on an item without running it. */
  select(index: number): void {
    const next = Math.max(0, Math.min(this.items.length - 1, index));
    // Moving off a row cancels a removal waiting on a second DEL. Without this,
    // arming one instrument and then arrowing to another would leave the `DEL`
    // that removes the NEXT one primed by a press you made about a different
    // row — a confirmation that follows the highlight is not a confirmation.
    if (next !== this.selected && this.arm.id !== '') {
      this.arm = NO_ARM;
      this.pageStatus();
    }
    this.selected = next;
    this.itemButtons.forEach((button, i) => button.setFocused(i === next));
    this.setDescription(this.items[next].description);
  }

  /**
   * A key while the menu is up. The scene routes here BEFORE its own bindings,
   * so the arrows (or `W A S D`) move the highlight instead of the pattern cursor
   * behind the curtain, and Space cannot start playback from inside a menu.
   */
  handleKey(event: KeyboardEvent): void {
    // `DEL` before the shared intents, and only on a CHOOSER: it means nothing
    // on the file page, and reading it here rather than adding it to
    // `menuIntent` keeps the other three menus from carrying — and swallowing —
    // a key they have no use for. Both choosers take it, because both hold a list
    // of app state that has no undo step behind it.
    if (hasRemoval(this.page) && (event.code === 'Delete' || event.code === 'Backspace')) {
      event.preventDefault();
      this.removeSelected();
      return;
    }
    const intent = menuIntent(event.code);
    if (intent === null) return;
    event.preventDefault();
    switch (intent) {
      case 'up':
        this.select((this.selected - 1 + this.items.length) % this.items.length);
        return;
      case 'down':
        this.select((this.selected + 1) % this.items.length);
        return;
      case 'first':
        this.select(0);
        return;
      case 'last':
        this.select(this.items.length - 1);
        return;
      case 'pick':
        this.itemButtons[this.selected]?.press();
        return;
      case 'close':
        // ESC backs out one level: a chooser returns to the menu rather than
        // closing it, so leaving the instrument or sample list is not the same
        // gesture as abandoning the F2 menu you opened.
        if (this.page !== 'file') this.showPage('file');
        else this.hide();
        return;
    }
  }

  /**
   * `DEL` on the highlighted row: the first press arms, the second takes it out.
   *
   * Two presses because these are the destructive things in the menu that
   * `Ctrl+Z` cannot take back: an imported instrument and a loaded recording are
   * app state, not song edits. The song is untouched either way, but a soundfont
   * loaded an hour ago can be a download you would have to find all over again,
   * and a WAV can be a file that is no longer at the path you loaded it from — so
   * a single stray keypress is not how that should happen.
   *
   * ONE handler for both pages, because the rule is the same rule: the arm names
   * the row it was armed on, and the page decides what removing means. That is
   * also why the arm is dropped when the page changes (see `showPage`).
   */
  private removeSelected(): void {
    if (!hasRemoval(this.page)) return;
    const samples = this.page === 'samples';
    const rows: { id: string; name: string }[] = samples
      ? (this.handlers.samples?.() ?? [])
      : (this.handlers.instruments?.() ?? []);
    // The load row and the way back sit in the list too, so the highlight is
    // mapped back onto the rows that CAN be removed rather than read off by
    // index — index 0 on this page is "load a recording", which is not a thing
    // to delete.
    const first = samples ? 1 : 0;
    const index = this.selected - first;
    const row = index >= 0 && index < rows.length ? rows[index] : undefined;
    const step = stepRemoval(this.arm, row?.id ?? null);
    this.arm = step.arm;
    const noun = samples ? 'RECORDING' : 'INSTRUMENT';

    switch (step.kind) {
      case 'none':
        this.setStatus(`NOTHING TO REMOVE  ·  HIGHLIGHT AN ${noun} FIRST.`, 'dim');
        return;
      case 'arm':
        // The row's name, not its id: the id is `noislet:kick-kit` and the name
        // is what the menu above the status line is showing.
        this.setStatus(`PRESS DEL AGAIN TO REMOVE "${row?.name ?? ''}" FROM THE LIST.`, 'error');
        return;
      case 'remove': {
        // The order is the whole of it: take it out of the library FIRST, then
        // rebuild the rows from the list it is no longer in, then say what
        // happened. Rebuilding before the removal leaves the row you just
        // deleted on the screen — the page draws the list it is handed, so it
        // has to be handed the list WITHOUT it.
        const result = samples
          ? this.handlers.removeSample?.(step.id) ?? null
          : this.handlers.removeInstrument?.(step.id) ?? null;
        this.showPage(samples ? 'samples' : 'instruments', true);
        this.report(result);
        return;
      }
    }
  }

  /**
   * What the chooser is for, said once under the list.
   *
   * The removal key is announced here rather than on the panel's fixed hint line
   * because it only exists on THIS page, and a hint you can see while it does
   * nothing is how a menu teaches you not to trust it.
   */
  private pageStatus(): void {
    if (this.page === 'starters') {
      this.setStatus(
        'PICK A SKELETON TO BEGIN FROM  \u00b7  IT REPLACES THE SONG, AND Ctrl+Z TAKES THAT BACK',
        'dim',
      );
      return;
    }
    if (this.page === 'instruments') {
      this.setStatus(
        this.instrumentCount() > 0
          ? 'PICK THE ONE `wave font` PLAYS  ·  DEL REMOVES THE HIGHLIGHTED ONE'
          : 'NOTHING IMPORTED YET  ·  USE `IMPORT FROM NOISLET` OR `LOAD SOUNDFONT`',
        'dim',
      );
      return;
    }
    if (this.page === 'samples') {
      this.setStatus(
        this.sampleCount() > 0
          ? 'ENTER GIVES THE SELECTED CHANNEL THIS RECORDING  ·  DEL REMOVES IT FROM THE BANK'
          : 'NOTHING LOADED YET  ·  USE `LOAD A RECORDING` ABOVE, OR `sample load \"path\"` IN A SCRIPT',
        'dim',
      );
    }
  }

  destroy(): void {
    this.unsubscribe();
    this.picker?.remove();
    for (const button of this.itemButtons) button.destroy();
    // ...and the heading goes with the rest of `staticTexts`, a few lines down:
    // it is one of them now, and destroying it twice is the kind of tidy-up that
    // becomes a crash the day somebody reorders these lines.
    this.closeButton.destroy();
    this.description.destroy();
    for (const entry of this.staticTexts) entry.obj.destroy();
    for (const line of this.statusTexts) line.destroy();
    this.curtain.destroy();
    this.dim.destroy();
    this.frame.destroy();
  }

  // --- open/close plumbing --------------------------------------------------

  private setOpen(open: boolean): void {
    // Only report a CHANGE: the constructor closes once to reach a known state,
    // and the scene would otherwise hear "closed" before its input exists.
    const changed = open !== this.opened;
    this.opened = open;
    this.dim.setVisible(open);
    this.frame.setVisible(open);
    this.curtain.setVisible(open);
    this.closeButton.container.setVisible(open);
    for (const button of this.itemButtons) button.container.setVisible(open);
    for (const entry of this.staticTexts) entry.obj.setVisible(open);
    for (const line of this.statusTexts) line.setVisible(open);
    this.description?.setVisible(open);
    if (changed) this.handlers.onOpenChange?.(open);
  }

  // --- the three actions ----------------------------------------------------

  /**
   * Ask the browser for a file. The input is created on demand and removed the
   * moment it answers, because a file input is a one-shot control and a stale
   * one in the DOM is a stale file the next time it fires.
   */
  private pickFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = [SCRIPT_FILE_EXTENSION, SONG_FILE_EXTENSION, ...MIDI_FILE_EXTENSIONS, 'text/plain', 'application/json', 'audio/midi'].join(',');
    input.setAttribute('aria-label', 'Open a song, script or MIDI file');
    // Which reader a file gets is decided by its NAME, and a MIDI file must be
    // read as BYTES: read as text a `.mid` would be mangled beyond hope.
    this.openPicker(input, (name, file) => {
      this.setStatus(`READING  ${name}...`, 'dim');
      const lower = name.toLowerCase();
      return MIDI_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension))
        ? file.arrayBuffer().then((bytes) => this.handlers.openMidi?.(name, bytes) ?? null)
        : file.text().then((text) => this.handlers.openFile?.(name, text) ?? null);
    });
  }

  /**
   * Ask the browser for a `.sf2`. Its own picker rather than the open one, so a
   * font can never be mistaken for a song. The status line says what a font must
   * not do \u2014 replace the song \u2014 right where the file dialog appears.
   */
  private pickSoundFont(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = [...SOUNDFONT_FILE_EXTENSIONS, 'audio/x-soundfont', 'application/octet-stream'].join(',');
    input.setAttribute('aria-label', 'Load a SoundFont instrument bank (.sf2)');
    this.openPicker(input, (name, file) => {
      this.setStatus(`LOADING  ${name}  \u2014  THE SONG IS NOT TOUCHED...`, 'dim');
      return file.arrayBuffer().then((bytes) => this.handlers.openSoundFont?.(name, bytes) ?? null);
    });
  }

  /**
   * Ask the browser for a `.instrument.json`.
   *
   * A third picker, for the same reason there are two: the three imports accept
   * different files, and one picker accepting all of them would put "read as a
   * song" and "read as an instrument" behind the same gesture. Read as TEXT
   * because a JSON document is characters, which is what the reader wants.
   */
  private pickInstrument(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = [INSTRUMENT_FILE_EXTENSION, '.json', 'application/json'].join(',');
    input.setAttribute('aria-label', 'Import a saved instrument (.instrument.json)');
    this.openPicker(input, (name, file) => {
      this.setStatus(`IMPORTING  ${name}  \u2014  THE SONG IS NOT TOUCHED...`, 'dim');
      return file.text().then((text) => this.handlers.openInstrument?.(name, text) ?? null);
    });
  }

  /**
   * Ask the browser for a `.patch.json`.
   *
   * A fifth picker, for the reason there are four: the imports accept different
   * files, and one picker taking all of them would put "read as a song" and "read
   * as a sound" behind the same gesture. Read as TEXT, because a patch is a
   * document. The status line says what this one DOES rather than that the song is
   * untouched \u2014 because it is not untouched: it changes one channel, which is
   * exactly why it is a picker of its own and not a thing `OPEN FILE` might do.
   */
  private pickPatch(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = [PATCH_FILE_EXTENSION, '.json', 'application/json'].join(',');
    input.setAttribute('aria-label', 'Import a saved sound patch (.patch.json)');
    this.openPicker(input, (name, file) => {
      this.setStatus(`READING  ${name}...`, 'dim');
      return file.text().then((text) => this.handlers.openPatch?.(name, text) ?? null);
    });
  }

  /**
   * Ask the browser for a `.kit.json`.
   *
   * A sixth picker, for the reason there are five, and read as TEXT for the reason
   * a patch is: a kit is a document. The status line says what this one DOES \u2014 it
   * changes the drums of the whole song \u2014 because that is more than a person
   * reading `LOAD` might expect from a file.
   */
  private pickKit(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = [KIT_FILE_EXTENSION, '.json', 'application/json'].join(',');
    input.setAttribute('aria-label', 'Import a saved drum kit (.kit.json)');
    this.openPicker(input, (name, file) => {
      this.setStatus(`READING  ${name}...`, 'dim');
      return file.text().then((text) => this.handlers.openKit?.(name, text) ?? null);
    });
  }

  /**
   * Ask the browser for a `.wav` to add to the sample bank.
   *
   * A fourth picker, for the reason there are three: the imports accept
   * different files, and one picker taking all of them would put "read as a
   * song" and "read as a recording" behind the same gesture. Asked for by
   * `sample import` in a script as well as by a hand, which is why
   * `openSamplePicker()` is public.
   */
  private pickSample(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = [...SAMPLE_FILE_EXTENSIONS, 'audio/wav', 'audio/x-wav', 'audio/wave'].join(',');
    input.setAttribute('aria-label', 'Import a WAV recording into the sample bank');
    this.openPicker(input, (name, file) => {
      this.setStatus(`LOADING  ${name}  \u2014  THE SONG IS NOT TOUCHED...`, 'dim');
      return file.arrayBuffer().then((bytes) => {
        const result = this.handlers.openSample?.(name, bytes) ?? null;
        // The bank changed, so the page's rows are stale: rebuild them from the
        // list the load just changed, the same way a removal does. Without this
        // the recording you just picked is not on the page you picked it from,
        // which reads as a load that failed.
        if (this.page === 'samples') this.showPage('samples', true);
        return result;
      });
    });
  }

  /**
   * Open the menu's WAV picker from outside \u2014 a script's `sample import`.
   *
   * The menu closes first, because the file dialog takes the whole screen and a
   * panel left hanging over the app while it is up reads as a crash. The same
   * two lines `openInstrumentPicker` does, for the same reason.
   */
  openSamplePicker(): void {
    this.hide();
    this.pickSample();
  }

  /**
   * Wire one file input up and click it.
   *
   * `read` is handed the file and answers a result; the plumbing around it \u2014
   * disabling the input, reporting the result, putting the reason on screen when
   * the read itself fails, and removing the element \u2014 is the same for every
   * picker the menu has, which is why it lives here rather than twice.
   */
  private openPicker(input: HTMLInputElement, read: (name: string, file: File) => Promise<FileActionResult | null>): void {
    this.picker?.remove();
    input.style.display = 'none';
    const finish = (): void => {
      input.remove();
      if (this.picker === input) this.picker = null;
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { finish(); return; }
      read(file.name, file)
        .then((result) => { this.report(result); })
        .catch((error: unknown) => {
          this.setStatus(`COULD NOT READ  ${file.name}`, 'error', [messageOf(error)]);
        })
        .finally(finish);
    });
    // Cancelling a dialog fires `cancel` in current browsers; the fallback keeps
    // the element from outliving the menu if it never does.
    input.addEventListener('cancel', finish);
    document.body.appendChild(input);
    this.picker = input;
    input.click();
  }

  private save(extension: string, mime: string, text: () => string | undefined): void {
    const body = text() ?? '';
    if (body === '') {
      this.setStatus('THERE IS NOTHING TO SAVE', 'error');
      return;
    }
    const name = `${this.handlers.fileStem?.() ?? 'tracklet-song'}${extension}`;
    this.download(name, `${mime};charset=utf-8`, body);
    this.setStatus(`SAVED  ${name}`, 'ok', [`${body.length} characters written.`]);
  }

  /**
   * Render the song and write the result out as a `.wav`.
   *
   * The render is asynchronous and can FAIL — a browser with no offline audio, a
   * context that will not start — so the menu says WORKING while it waits and
   * puts the reason on screen if it does not work. Silently downloading nothing
   * would be the worst possible answer to "export my song".
   */
  private exportAudio(): void {
    const make = this.handlers.audioFile;
    if (!make) {
      this.setStatus('THIS BUILD CANNOT RENDER AUDIO', 'error');
      return;
    }
    this.setStatus('RENDERING AUDIO...', 'dim');
    make()
      .then((out) => {
        if ('error' in out) {
          this.setStatus('COULD NOT RENDER THE SONG', 'error', [out.error]);
          return;
        }
        const name = `${this.handlers.fileStem?.() ?? 'tracklet-song'}.wav`;
        this.download(name, 'audio/wav', out.bytes);
        this.setStatus(`SAVED  ${name}`, 'ok', [
          `${out.seconds.toFixed(1)} seconds of audio  -  ${this.regionLabel()}`,
          ...out.details,
        ]);
      })
      .catch((error: unknown) => {
        this.setStatus('COULD NOT RENDER THE SONG', 'error', [messageOf(error)]);
      });
  }

  /**
   * Render every channel and write the set out as one `.zip`.
   *
   * The slowest thing this menu does — the song is rendered once per channel —
   * so the status well says so BEFORE the wait starts rather than after it. The
   * two noes (`no offline audio`, `nothing to render`) arrive as sentences, and
   * the yes names the files, because "SAVED my-tune-stems.zip" alone would not
   * say whether the parts came out or only the archive did.
   */
  private exportStems(): void {
    const make = this.handlers.stemsFile;
    if (!make) {
      this.setStatus('THIS BUILD CANNOT RENDER AUDIO', 'error');
      return;
    }
    this.setStatus('RENDERING STEMS...', 'dim', ['One .wav per channel \u2014 this takes a moment.']);
    make()
      .then((out) => {
        if ('error' in out) {
          this.setStatus('COULD NOT RENDER THE STEMS', 'error', [out.error]);
          return;
        }
        const name = stemArchiveName(this.handlers.fileStem?.() ?? 'tracklet-song');
        this.download(name, 'application/zip', out.bytes);
        this.setStatus(`SAVED  ${name}`, 'ok', [
          `${out.names.length} ${out.names.length === 1 ? 'channel' : 'channels'}  -  ${out.seconds.toFixed(1)} seconds each  -  ${this.regionLabel()}`,
          out.names.join('  '),
          ...out.details,
        ]);
      })
      .catch((error: unknown) => {
        this.setStatus('COULD NOT RENDER THE STEMS', 'error', [messageOf(error)]);
      });
  }

  /**
   * Write the song out as a `.mid`.
   *
   * The counterpart of the MIDI row on `OPEN FILE…`, and the one place where the
   * two halves of the format are visible at once: this writes what that reads.
   * Nothing is downloaded when the song has no notes in it, because this app's own
   * reader refuses such a file ("this MIDI file has no notes in it") and handing
   * somebody a download that cannot be opened again is worse than a sentence.
   */
  private exportMidi(): void {
    const make = this.handlers.midiFile;
    if (!make) {
      this.setStatus('THIS BUILD CANNOT WRITE MIDI', 'error');
      return;
    }
    const out = make();
    if ('error' in out) {
      this.setStatus('THERE IS NOTHING TO EXPORT', 'error', [out.error]);
      return;
    }
    const name = `${this.handlers.fileStem?.() ?? 'tracklet-song'}${MIDI_EXPORT_FILE_EXTENSION}`;
    this.download(name, 'audio/midi', out.bytes);
    this.setStatus(`SAVED  ${name}`, 'ok', [
      `${out.notes} notes over ${out.bars} ${out.bars === 1 ? 'bar' : 'bars'} \u2014 the notes only, as MIDI.`,
    ]);
  }

  /**
   * Write the cursor channel's sound out as a patch document.
   *
   * The counterpart of `LOAD PATCH`, and the smallest of the writers: a patch is
   * text the model builds in one call, so there is nothing to wait for and no
   * render to fail. The two lines under the status are the useful half \u2014 what is
   * IN the patch, and what is deliberately not \u2014 because a person saving a sound
   * they are about to send somebody should be able to see both.
   */
  private savePatch(): void {
    const make = this.handlers.patchFile;
    if (!make) {
      this.setStatus('THIS BUILD CANNOT WRITE A PATCH', 'error');
      return;
    }
    const out = make();
    if ('error' in out) {
      this.setStatus('THERE IS NOTHING TO SAVE', 'error', [out.error]);
      return;
    }
    this.download(out.fileName, 'application/json', out.text);
    this.setStatus(`SAVED  ${out.fileName}`, 'ok', [
      out.detail,
      'No level, no pan and no group: a patch is the sound, not where it sat.',
    ]);
  }

  /**
   * Write the song's drums out as a kit document.
   *
   * `savePatch`'s twin, one scope out: a kit is text the model builds in one call,
   * so there is nothing to wait for and no render to fail. The line under the
   * status says what is in the four voices \u2014 a wave each \u2014 because that is the
   * fastest honest answer to "what did I just save".
   */
  private saveKit(): void {
    const make = this.handlers.kitFile;
    if (!make) {
      this.setStatus('THIS BUILD CANNOT WRITE A KIT', 'error');
      return;
    }
    const out = make();
    if ('error' in out) {
      this.setStatus('THERE IS NOTHING TO SAVE', 'error', [out.error]);
      return;
    }
    this.download(out.fileName, 'application/json', out.text);
    this.setStatus(`SAVED  ${out.fileName}`, 'ok', [
      out.detail,
      'The four voices, not the mix: a kit is the drums, not where they sat.',
    ]);
  }

  /** What an export's status line says about WHICH bars it wrote. */
  private regionLabel(): string {
    return this.handlers.bounceLabel?.() ?? 'THE WHOLE SONG';
  }

  /**
   * Put a blob on the user's disk.
   *
   * The browser half is shared with the recorder page (`ui/download.ts`), so an
   * export produces the same download from either screen; this method is kept as
   * the menu's name for it because the menu is what reports the result.
   */
  private download(name: string, mime: string, body: BlobPart | Uint8Array): void {
    downloadBytes(name, mime, body);
  }

  /** Show what an action had to say, or an error's own words. */
  private report(result: FileActionResult | null): void {
    if (!result) return;
    this.setStatus(result.status, result.tone === 'ok' ? 'ok' : 'error', result.details);
  }

  // --- drawing --------------------------------------------------------------

  private setDescription(text: string): void {
    if (text === this.descriptionText) return;
    this.descriptionText = text;
    this.description.setText(text);
  }

  private setStatus(text: string, tone: 'ok' | 'error' | 'dim', details?: string[]): void {
    this.lastStatus = details ? { text, tone, details } : { text, tone };
    for (const line of this.statusTexts) line.destroy();
    this.statusTexts = [];

    const c = activeColors();
    const color = tone === 'ok' ? c.textGreen : tone === 'error' ? c.danger : c.textDim;
    const rows = [text, ...(details ?? [])].slice(0, MAX_STATUS_LINES);

    // Born at the menu's current visibility: the constructor writes the idle
    // status while the menu is still closed, and those rows must not paint
    // themselves over the pattern grid.
    rows.forEach((row, i) => {
      const line = uiText(this.scene, MODAL.x + 4, STATUS_TOP + i * LINE_H, row, {
        size: 8, color, wordWrapWidth: MODAL.width - 8,
      });
      line.setDepth(DEPTH_FRONT);
      line.setVisible(this.opened);
      this.statusTexts.push(line);
    });
  }

  private addStatic(x: number, y: number, text: string, role: TextRole): void {
    const obj = uiText(this.scene, x, y, text, { size: 8, color: activeColors().textPrimary });
    obj.setDepth(DEPTH_FRONT);
    this.staticTexts.push({ obj, role });
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
    drawDivider(frame, MODAL.x + 2, STATUS_TOP - 16, MODAL.width - 4, 1, c);

    const roleColor: Record<TextRole, number> = {
      heading: c.textDim,
      body: c.textPrimary,
      accent: theme.colors.ooze,
      dim: c.textDim,
    };
    for (const entry of this.staticTexts) entry.obj.setColor(intToCss(roleColor[entry.role]));
    this.description.setColor(intToCss(c.textPrimary));
    // The status line is built fresh each time, so it has to be rebuilt to
    // pick up the new palette rather than repainted.
    this.setStatus(this.lastStatus.text, this.lastStatus.tone, this.lastStatus.details);
  }
}

/**
 * Which pages hold rows that can be TAKEN OUT of something.
 *
 * Two of the five, and the distinction matters three times: DEL is only read on
 * these, `removeSelected` maps its rows by index only on these, and a page that
 * removes nothing must not be able to arm a removal against a row on another
 * page. STARTERS is the one that made it a question — it has rows, and every one
 * of them is a song rather than a thing to delete — and EXPORT and the file page
 * give the same answer for the same reason: their rows DO something, and there
 * is nothing behind them to take away.
 */
function hasRemoval(page: FilePage): boolean {
  return page === 'instruments' || page === 'samples';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
