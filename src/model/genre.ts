/**
 * genre — a whole song to start from, as DATA.
 *
 * Every feature this app grew made it more capable and harder to BEGIN in: a
 * beginner facing a blank grid with eight voices, a rack of effects, a kit, a
 * progression and an arrangement has been handed a studio and no song. A
 * STARTER is the answer to "what do I do first": one word, `start house`, and
 * there is a working skeleton — a key, a tempo, a feel, a kit, named channels
 * with the right sounds on them, a drum figure, a chord loop and a form — which
 * the author then edits rather than invents.
 *
 * ── Why it is a SCRIPT ─────────────────────────────────────────────────────
 * A starter is stored as Tracklet Script rather than as a table of fields. That
 * is the whole design, and every consequence is good:
 *
 *   • it CANNOT describe anything the language cannot say, so a starter is always
 *     exactly reproducible by hand — the app is not quietly doing something a
 *     person could not type;
 *   • the test suite applies all three to a blank song (see `genre.test.ts`) and
 *     so does the docs guard, which means a starter that drifts out of the
 *     language fails the BUILD rather than the beginner;
 *   • it doubles as documentation: `start house` followed by `SAVE AS SCRIPT`
 *     prints the skeleton back out as lines to read, copy and edit, which is the
 *     fastest way anybody learns this notation;
 *   • and the language keeps one word for it. `start NAME` expands in the PARSER
 *     into the starter's own lines, so a starter is not a new kind of statement
 *     with its own semantics — it is the same script, typed for you.
 *
 * ── What a starter must be ─────────────────────────────────────────────────
 * Every one of them begins with `new`, which is what makes `start house` mean
 * "the song becomes this" rather than "this is merged into whatever is there":
 * the lines above it are discarded, exactly as they would be by a `new` line —
 * and a file's meaning never depends on what happened to be on screen.
 *
 * Every one of them is a WORKING song — audible notes on the default grid, one
 * undo step, editable in the grid like anything else — with the loop left in as
 * a `progression` so the next bar of it can be written rather than retyped. A
 * starter that only set knobs would be a preset; these are openings.
 *
 * A starter brings no file format with it. It writes ordinary statements, so a
 * song that began from one saves as the version its own features need and opens
 * anywhere — the starter is what the song STARTED as, not what it is.
 */

/** The statement that starts one: `start house`. */
export const GENRE_WORD = 'start';

export interface GenreStarter {
  /** The word a script writes and the menu sends: one word, lower case. */
  id: string;
  /** The menu's label, upper case like every other label in the app. */
  label: string;
  /** One line saying what it is FOR, in the menu and beside the script. */
  blurb: string;
  /** The whole skeleton, as Tracklet Script. Always begins with `new`. */
  script: string;
}

/**
 * The nine, in the order the menu lists them.
 *
 * They are deliberately nine different SONGS rather than nine tempos: a house
 * record at 124 with a four-on-the-floor kit and a two-bar break, a slow lofi
 * loop with seventh chords and brushes, a ballad with a piano, strings and a
 * melody, a rock band playing power chords through the loop, a midwest-emo
 * tap, a half-time vaporwave loop, a chorus-wide synthwave arp, a shoegaze
 * wall, and a 174 BPM drum & bass roll. A reader who wants to know how this app
 * writes a genre reads the one nearest their intent and changes a number.
 *
 * ── Why they come in this order ─────────────────────────────────────────────
 * The first three are the ones a beginner meets first, and each one teaches a
 * different HALF of the language: house is a loop and a form, lofi is feel and
 * seventh chords, ballad is the loop PLAYED rather than typed. The six after
 * them are the genre shelf of `ROADMAP-GENRES.md`, added because the engine
 * could already imply those records and only lacked a word for them.
 *
 * ── The shelf has a ceiling that is not about the language ──────────────────
 * `F2 → STARTERS…` draws one row per starter with no scrolling, and eleven rows
 * is that panel's ceiling, so nine starters plus `BACK` is the last shelf that
 * fits. A tenth starter needs the page to scroll first.
 */
export const GENRES: readonly GenreStarter[] = [
  {
    id: 'house',
    label: 'HOUSE',
    blurb: '124 BPM, four on the floor, an 808 kit, a one-bar loop of Am F C G, a drums-only break and a form that repeats the loop into a 52-bar track. The dance skeleton.',
    script: `new
song "HOUSE"
key A minor
tempo 124
groove offbeat
kit 808
tracks 6

bus DRUMS 80
track 1 "KICK"   voice kick  level 100 bus DRUMS
track 2 "HAT"    voice hat   level 45 pan R15 bus DRUMS
track 3 "CLAP"   voice snare level 70 bus DRUMS
track 4 "BASS"   voice sub   level 75
track 5 "CHORDS" voice pad   hold 8 poly 3 level 50 pan L20 verb 40
track 6 "STAB"   voice pluck level 60 shape sharp

pattern 1 "GROOVE"
kick . .     A-2 . .
.    . .     .   . .
.    hat .   .   . C-5
.    . .     .   . .
kick . snare .   . .
.    . .     .   . .
.    hat .   .   . E-5
.    . .     .   . .
kick . .     F-2 . .
.    . .     .   . .
.    hat .   .   . A-4
.    . .     .   . .
kick . snare G-2 . .
.    . .     .   . .
.    hat .   .   . C-5
.    . .     .   . .

progression Am F C G
chord 0 5 follow

copy 1 2
pattern 2 "TURN"
note 14 6 E-5
drum 15 1 kick

pattern 3 "BREAK"
kick . .     . . .
.    . .     . . .
.    hat .   . . .
.    . .     . . .
kick . snare . . .
.    . .     . . .
.    hat .   . . .
.    . .     . . .
kick . .     . . .

section INTRO 3
section GROOVE 1 1 2 2
section BREAK 3 3
section OUT 2
arrange INTRO GROOVE repeat 6 BREAK GROOVE repeat 6 OUT`,
  },
  {
    id: 'lofi',
    label: 'LOFI',
    blurb: '78 BPM, laid back and swung, brushed drums, seventh chords on a wide channel, and an Am7 Dm7 Fmaj7 Cmaj7 loop that repeats instead of moving.',
    script: `new
song "LOFI"
key C major
tempo 78
swing 55
groove laid-back
kit brush
tracks 5

bus DRUMS 70
track 1 "KICK"  voice kick  level 90 bus DRUMS
track 2 "SNARE" voice snare level 55 bus DRUMS
track 3 "HAT"   voice hat   level 35 pan R10 bus DRUMS
track 4 "BASS"  voice bass  level 70
track 5 "KEYS"  voice organ hold 8 poly 4 level 50 pan L10 verb 45 tape 40

# Tape is the whole genre, and it is ONE number: the peaks round off, the
# transport wanders a little in pitch, and a quiet hiss sits under everything.
# On the mix as well, because a lo-fi record is not a lo-fi arrangement with a
# clean band on top of it. And a light vinyl under that, which is what makes it
# sound FOUND rather than merely warm: the surface hiss and the odd crackle of a
# record somebody sampled, not a tape somebody recorded to.
master tape 25 vinyl 12
pattern 1 "LOOP"
kick . .     A-2 .
.    . .     .   .
.    hat .   .   .
.    . .     .   .
.    snare . D-2 .
.    . .     .   .
.    hat .   .   .
.    . .     .   .
kick . .     F-2 .
.    . .     .   .
.    hat .   .   .
.    . .     .   .
.    snare C-3 .
.    . .     .   .
.    hat .   .   .
.    . .     .   .

progression Am7 Dm7 Fmaj7 Cmaj7
chord 0 5 follow

copy 1 2
pattern 2 "CHORUS"
drum 6 1 kick
drum 14 2 snare

section LOOP 1 1
section CHORUS 2 2
section TURN 1
arrange LOOP repeat 6 CHORUS repeat 4 LOOP repeat 2 TURN`,
  },
  {
    id: 'ballad',
    label: 'BALLAD',
    blurb: '72 BPM, a piano and strings over Am F C G held a bar each, a hand-written bass under them and a melody above. The slow skeleton, and the one that shows the loop being played rather than typed.',
    script: `new
song "BALLAD"
key A minor
tempo 72
swing 45
kit studio
steps 32
tracks 5

bus DRUMS 65
track 1 "DRUMS"   level 80 bus DRUMS
track 2 "BASS"    voice sub     level 70
track 3 "KEYS"    voice glass   hold 8  poly 3 level 55 pan L15 verb 45
track 4 "STRINGS" voice strings hold 16 level 35 pan R20 verb 60
track 5 "MELODY"  voice flute   level 85

# The loop, one chord to the bar. The followers write at the octave the script
# is at, so the strings sit where strings sit and the piano lands above them.
octave 3
progression Am F C G hold 8
chord 0 3 follow
note 0 4 follow

pattern 1 "VERSE"
kick .     A-2 . .
.    .     .   . .
.    .     .   . .
.    .     .   . .
hat  .     .   . .
.    .     .   . .
.    .     .   . .
.    .     .   . E-5
.    snare F-2 . .
.    .     .   . .
hat  .     .   . .
.    .     .   . .
.    .     .   . C-5
.    .     .   . .
.    .     .   . .
.    .     .   . .
kick .     C-3 . .
.    .     .   . .
.    .     .   . .
.    .     .   . .
hat  .     .   . .
.    .     .   . .
.    .     .   . .
.    .     .   . D-5
.    snare G-2 . .
.    .     .   . .
hat  .     .   . .
.    .     .   . .
.    .     E-3 . B-4
.    .     .   . .
.    .     .   . .
.    .     .   . .

copy 1 2
pattern 2 "CHORUS"
note 6 5 C-5
note 14 5 D-5

section VERSE 1 1
section CHORUS 2 2
section OUT 1
arrange VERSE repeat 2 CHORUS VERSE CHORUS repeat 2 VERSE OUT`,
  },
  {
    id: 'rock',
    label: 'ROCK',
    blurb: '140 BPM, a live kit, and a rhythm guitar that is one WALL rather than a part: the loop writes which chord the riff is, so Em C G D is a power-chord band.',
    script: `new
song "ROCK"
key E minor
tempo 140
groove backbeat
kit rock
tracks 6

bus DRUMS 85
track 1 "KICK"  voice kick  level 100 bus DRUMS
track 2 "SNARE" voice snare level 82  bus DRUMS
track 3 "HAT"   voice hat   level 40 pan R15 bus DRUMS
track 4 "RIFF"  voice pluck drive 55 cab 65 poly 3 level 58 shape sharp
track 5 "BASS"  voice bass  drive 30 level 72
track 6 "LEAD"  voice lead  drive 40 cab 50 level 55 pan L18 verb 25

# drive then cab is the amp, in the order the signal takes it: the fuzz first,
# the speaker box second. Take the cab out and this is a synth playing a riff;
# with it there, it is a band.
#
# The guitar is a WALL rather than a part: one rhythm, and the loop writes which
# chord it is. Change the progression and the riff follows it.
pattern 1 "VERSE"
kick  .     .   .    E-2  .
.     .     hat .    .    .
.     .     .   .    E-2  .
.     .     hat .    .    .
.     snare .   .    E-2  .
.     .     hat .    .    .
.     .     .   .    E-2  B-4
.     .     hat .    .    .
kick  .     .   .    E-2  .
.     .     hat .    .    .
.     .     .   .    E-2  .
.     .     hat .    .    .
.     snare .   .    E-2  .
.     .     hat .    .    .
kick  .     .   .    G-2  A-4
.     .     hat .    .    .

progression Em C G D
chord 0 4 follow

copy 1 2
pattern 2 "CHORUS"
drum 0 3 wind
drum 8 1 kick
note 0 6 E-5
note 4 6 B-4
note 8 6 G-5
note 12 6 D-5

section VERSE 1 1
section CHORUS 2 2
section OUT 1
arrange VERSE CHORUS VERSE CHORUS repeat 2 OUT`,
  },
  {
    id: 'emo',
    label: 'EMO',
    blurb: '96 BPM, brushed drums swung a hair, and a tapped arpeggio on a channel that HOLDS so the notes ring over each other. The twinkle, and a bass that walks the loop.',
    script: `new
song "EMO"
key B minor
tempo 96
swing 52
groove laid-back
kit brush
tracks 5

bus DRUMS 70
track 1 "KICK"  voice kick  level 85 bus DRUMS
track 2 "SNARE" voice snare level 48 bus DRUMS
track 3 "HAT"   voice hat   level 30 pan R12 bus DRUMS
track 4 "TAP"   voice glass hold 4 level 52 pan L15 verb 45
track 5 "BASS"  voice bass  level 70

# Tapping is a chord played one note at a time with the notes left ringing, which
# is exactly what arp is on a channel that HOLDS — hold 4 is the whole trick.
pattern 1 "VERSE"
kick  .     .   .    .
.     .     .   .    .
.     .     hat .    .
.     .     .   .    .
.     snare .   .    .
.     .     .   .    .
.     .     hat .    .
.     .     .   .    .
kick  .     .   .    .
.     .     .   .    .
.     .     hat .    .
.     .     .   .    .
.     snare .   .    .
.     .     .   .    .
.     .     hat .    .
.     .     .   .    .

progression Bm G D A
chord 0 4 Bm arp up 8
chord 8 4 D arp down 8
note 0 5 follow

copy 1 2
pattern 2 "LOUD"
drum 0 3 wind
drum 12 1 kick

section VERSE 1 1
section LOUD 2 2
section OUT 1
arrange VERSE LOUD VERSE LOUD repeat 2 OUT`,
  },
  {
    id: 'vaporwave',
    label: 'VAPORWAVE',
    blurb: '62 BPM and half time, so the bar breathes twice as slowly: major-seventh chords on a wide pad, a sub bass under them and a bell melody drowning in reverb.',
    script: `new
song "VAPORWAVE"
key A major
tempo 62
kit 808
tracks 6

bus DRUMS 75
track 1 "KICK"  voice kick  level 95  bus DRUMS
track 2 "CLAP"  voice snare level 45  bus DRUMS
track 3 "HAT"   voice hat   level 28 pan R12 bus DRUMS
track 4 "PAD"   voice pad   hold 8 poly 4 level 42 verb 65 tape 30
track 5 "BASS"  voice sub   level 70
track 6 "BELL"  voice bell  hold 4 level 48 pan L20 verb 55 tape 20

# The tape is what makes this sound FOUND rather than written: the pad moves
# slightly in pitch, and the whole record hisses at 25.
master tape 25

# Half time is a tempo, not a groove: at 62 BPM a kick on 1 and a clap on 3 IS
# the slow nod, and the seventh chords are what make the loop dreamy.
pattern 1 "LOOP"
kick  .     .   .     .   .
.     .     .   .     .   .
.     .     hat .     .   .
.     .     .   .     .   .
.     .     .   .     .   .
.     .     .   .     .   .
.     .     hat .     .   .
.     .     .   .     .   .
kick  snare .   .     .   C-6
.     .     hat .     .   .
.     .     .   .     .   .
.     .     .   .     .   .
.     .     .   .     .   E-6
.     .     hat .     .   .
.     .     .   .     .   .
.     .     .   .     .   .

progression AM7 F#m7 DM7 E7
chord 0 4 follow
note 0 5 follow

copy 1 2
pattern 2 "CHORUS"
drum 0 3 wind
note 2 6 A-5
note 6 6 F#-5
note 10 6 D-6
note 14 6 E-6

section LOOP 1 1
section CHORUS 2 2
section TURN 1
arrange LOOP LOOP CHORUS LOOP CHORUS repeat 2 TURN`,
  },
  {
    id: 'synthwave',
    label: 'SYNTHWAVE',
    blurb: '108 BPM, four on the floor, a chorus-wide string pad under the loop and a pluck arpeggio climbing over it: the neon night-drive, and the channel setup most of it comes from.',
    script: `new
song "SYNTHWAVE"
key A minor
tempo 108
groove backbeat
kit 808
tracks 6

bus DRUMS 80
track 1 "KICK"  voice kick    level 100 bus DRUMS
track 2 "SNARE" voice snare   level 60  bus DRUMS
track 3 "HAT"   voice hat     level 35 pan R15 bus DRUMS
track 4 "PAD"   voice strings chorus 65 hold 8 poly 4 level 48 verb 45
track 5 "BASS"  voice sub     level 72
track 6 "ARP"   voice pluck   hold 2 level 45 pan L18 verb 30

pattern 1 "VERSE"
kick  .     .   .   .   .
.     .     hat .   .   .
.     .     .   .   .   .
.     .     hat .   .   .
kick  snare .   .   .   .
.     .     hat .   .   .
.     .     .   .   .   .
.     .     hat .   .   .
kick  .     .   .   .   .
.     .     hat .   .   .
.     .     .   .   .   .
.     .     hat .   .   .
kick  snare .   .   .   .
.     .     hat .   .   .
.     .     .   .   .   .
.     .     hat .   .   .

progression Am Em F G
chord 0 4 follow
note 0 5 follow
chord 0 6 Am arp up 8
chord 8 6 F arp down 8

copy 1 2
pattern 2 "CHORUS"
drum 0 3 wind
drum 6 1 kick
drum 14 2 snare

section VERSE 1 1
section CHORUS 2 2
section OUT 1
arrange VERSE CHORUS VERSE CHORUS repeat 2 OUT`,
  },
  {
    id: 'shoegaze',
    label: 'SHOEGAZE',
    blurb: '88 BPM and a wall rather than a part: driven, chorused strings holding major-seventh chords, a slow kit, and a glass melody sitting inside the noise rather than over it.',
    script: `new
song "SHOEGAZE"
key E major
tempo 88
kit studio
tracks 6

bus DRUMS 72
track 1 "KICK"   voice kick    level 92 bus DRUMS
track 2 "SNARE"  voice snare   level 55 bus DRUMS
track 3 "HAT"    voice hat     level 30 pan R12 bus DRUMS
track 4 "WALL"   voice strings drive 35 cab 45 chorus 70 hold 8 poly 4 level 42 verb 60
track 5 "BASS"   voice bass    level 70
track 6 "MELODY" voice glass   hold 4 level 55 pan L20 verb 55

# Three effects on ONE channel is the whole genre: drive is the noise, cab is the
# amp it comes out of, chorus is the smear, and the melody has to be loud enough
# to be heard THROUGH them.
pattern 1 "VERSE"
kick  .     .   .   .   .
.     .     .   .   .   .
.     .     hat .   .   .
.     .     .   .   .   .
.     snare .   .   .   .
.     .     hat .   .   .
.     .     .   .   .   .
.     .     hat .   .   B-4
kick  .     .   .   .   .
.     .     .   .   .   .
.     .     hat .   .   .
.     .     .   .   .   .
.     snare .   .   .   .
.     .     hat .   .   .
.     .     .   .   .   G#-4
.     .     hat .   .   .

progression EM7 C#m7 AM7 BM7
chord 0 4 follow
note 0 5 follow

copy 1 2
pattern 2 "WALL"
drum 0 3 wind
note 2 6 E-5
note 5 6 G#-4
note 10 6 B-4
note 13 6 E-5

section VERSE 1 1
section WALL 2 2
section OUT 1
arrange VERSE WALL VERSE WALL repeat 2 OUT`,
  },
  {
    id: 'dnb',
    label: 'DNB',
    blurb: '174 BPM and a broken beat: a kick that is never on 1 twice the same way, a snare on the back, a gated stab and a sub bass under a long reverb trail.',
    script: `new
song "DNB"
key G minor
tempo 174
kit 808
tracks 6

bus DRUMS 82
track 1 "KICK"  voice kick  level 100 bus DRUMS
track 2 "SNARE" voice snare level 65  bus DRUMS
track 3 "HAT"   voice hat   level 32 pan R15 bus DRUMS
track 4 "STAB"  voice lead  shape nasal gate 60 poly 3 level 48
track 5 "BASS"  voice sub   level 75
track 6 "ATMOS" voice glass hold 16 level 30 pan L22 verb 70

# The break is the genre: the kick is NOT on every beat, and the snare answers
# it. Everything else here is a long note and a gate.
pattern 1 "ROLL"
kick  .     .   .     .   .
.     .     hat .     .   .
.     .     .   .     .   .
kick  .     hat .     .   .
.     snare .   .     .   .
.     .     .   .     .   .
kick  .     hat .     .   .
.     .     .   .     .   G-4
.     .     hat .     .   .
.     .     .   .     .   .
kick  .     .   .     .   .
.     .     hat .     .   .
.     snare .   .     .   .
.     .     hat .     .   .
.     snare .   .     .   .
.     .     .   .     .   D-5

progression Gm Eb Bb F
chord 0 4 follow
note 0 5 follow

copy 1 2
pattern 2 "DROP"
drum 0 3 wind
drum 11 1 kick

section ROLL 1 1
section DROP 2 2
section OUT 1
arrange ROLL DROP ROLL DROP repeat 2 OUT`,
  },
];

/** Every starter id, in menu order. */
export const GENRE_IDS: readonly string[] = GENRES.map((genre) => genre.id);

/** The starters as one sentence reads them: `house, lofi, ballad, rock, ...`. */
export function genreNames(): string {
  return GENRE_IDS.join(', ');
}

/**
 * The starter a word names, or null.
 *
 * Case-insensitive, like every other word from a closed list here (`kit 808`,
 * `key D minor`), because a name typed at the top of a script is not the place to
 * be strict about a capital letter.
 */
export function genreFromName(name: string): GenreStarter | null {
  const wanted = name.trim().toLowerCase();
  return GENRES.find((genre) => genre.id === wanted) ?? null;
}

/** True when a word names a starter, for the parser's own check. */
export function isGenreName(name: string): boolean {
  return genreFromName(name) !== null;
}

/**
 * The line that starts one: `start house`.
 *
 * A function so the sentence exists in one place: the menu sends this rather
 * than assembling the word itself, which is what keeps `start` a word of the
 * LANGUAGE rather than of a menu — a starter can be begun from a pasted script,
 * a test and a click, and all three write the same line.
 */
export function genreScript(id: string): string {
  return `${GENRE_WORD} ${id}`;
}

/** A starter's label, or the word itself for something unknown. */
export function genreLabel(id: string): string {
  return genreFromName(id)?.label ?? id.toUpperCase();
}
