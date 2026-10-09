/**
 * edits — the surgical editor, as a pure function over a song.
 *
 * `song.edit` is a good idea and `library.update` needs the same idea one scope
 * out: edit a song that is already ON DISK, sending the changes rather than the
 * whole song. If each operation carried its own copy of the edit vocabulary the
 * two would drift the first time a field was added — a body that could set a
 * channel's level in memory but not in a file, and no test that could say why. So
 * the vocabulary lives here, once: `applyEdits` takes a song and a list of edits
 * and returns the change log, and the two operations are thin wrappers that decide
 * where the song comes from and where it goes.
 *
 * Everything below is pure. It mutates the song it is HANDED — the caller owns
 * that object, which is what makes the read-back in `library.write` possible — and
 * refuses an edit that does not fit by throwing an `ApiError` through `refuse`, so
 * an operation that applies a list is exactly as atomic as one that applies a
 * single change: the first bad edit throws, and the caller never sees a half-edited
 * song because the operation never returns one.
 *
 * Numbers are 1-based for patterns and channels — the way the app labels them and
 * the way a script addresses them — and 0-based for a row, because a row is an
 * index and `song.grid` prints them starting at zero. A pattern named past the end
 * is CREATED, exactly as `pattern 3` in a script creates it.
 */

import {
  ARP_DIRECTIONS,
  ARP_MODES,
  AUTOMATION_TARGET_WORDS,
  addMachineBar,
  addScene,
  arpDirectionFromName,
  arpLabel,
  arrangementBars,
  busNameProblem,
  busNames,
  cellText,
  clampArp,
  clampBpm,
  clampBusLevel,
  clampDuck,
  clampEffects,
  clampGlide,
  clampHitVelocity,
  clampHold,
  clampLevel,
  clampMachineBeat,
  clampMachineSteps,
  clampMidi,
  clampPadIndex,
  clampPan,
  clampParam,
  clampPoly,
  clampRoom,
  clampRows,
  clampRowsPerBeat,
  clampSceneBar,
  clampSceneClip,
  clampSectionBars,
  clampSectionMachineBar,
  clampSend,
  clampStutter,
  clampSwing,
  clampTune,
  clampVelocity,
  clampVibrato,
  clearCell,
  clearPattern,
  copyVoice,
  countMachineHits,
  countNotes,
  createMachine,
  DEFAULT_ARP,
  DEFAULT_MACHINE_STEPS,
  defaultPad,
  DRUM_IDS,
  duplicateScene,
  emptyRow,
  ensurePattern,
  grooveFromName,
  grooveNames,
  isAutomationTarget,
  isSongTitleLength,
  isTrackNameLength,
  keyName,
  laneLabel,
  kitFromName,
  kitNames,
  machineBarCount,
  machineBarRows,
  MAX_AUTOMATION_LANES,
  MAX_SCENES,
  MAX_BUSES,
  MAX_MACHINE_BARS,
  MAX_ORDER,
  MAX_PADS,
  MAX_SECTIONS,
  NO_BUS_WORD,
  NO_SAMPLE_WORD,
  noteNameToMidi,
  padAt,
  padPatternString,
  parseKey,
  parsePadPattern,
  patternRows,
  removeMachineBar,
  renameScene,
  resizeMachine,
  sameBusName,
  sameSampleName,
  sampleNameProblem,
  sceneByName,
  sceneLabel,
  sceneNameProblem,
  sceneNameSpelling,
  sectionByName,
  sectionNameProblem,
  setCellDrum,
  setCellNotes,
  setOrder,
  setMachineOrder,
  setPatternRows,
  tidyBusName,
  tidyLane,
  tidyPadName,
  tidySampleName,
  tidySceneName,
  tidySectionName,
  tidySongTitle,
  tidyTrackName,
  TRACK_EFFECTS,
  VOICE_PARAMS,
  voiceById,
  waveFromName,
  withBus,
  withPad,
  withMachineBar,
  withScene,
  withSection,
  withoutScene,
  withoutSection,
  type ArpMode,
  type ArpSettings,
  type AutomationLane,
  type Cell,
  type ChannelEffects,
  type DrumId,
  type DrumMachine,
  type DrumPad,
  type Song,
} from '../../src/model';
import { maybeBool, maybeNumber, maybeObject, maybeStr, type ApiInput } from './input';
import { badInput, refuse } from './result';

/** One line of the change log: what an edit did, and what was there before. */
export interface EditChange {
  /** Which edit in the list, 1-based, so a caller can line it up with what it sent. */
  edit: number;
  /** The edit's own word: `cell.set`, `track.set`, … */
  op: string;
  /** What it touched, spelled the way a person would point at it. */
  target: string;
  /** The value before, as text. */
  from: string;
  /** The value after, as text. */
  to: string;
  /** False when the edit was already the case — a no-op still gets a line. */
  changed: boolean;
}

/** The words an edit may use. A closed set, so a typo is one clear sentence. */
export const EDIT_OPS = [
  'song.set',
  'track.set',
  'machine.set',
  'pad.set',
  'pad.step',
  'machine.clear',
  'cell.set',
  'cell.clear',
  'pattern.clear',
  'order.set',
  'section.set',
  'section.clear',
  'arrange.set',
  'bus.set',
  'master.set',
  'arp.set',
  'arp.clear',
  'automation.set',
  'automation.clear',
  'scene.set',
  'scene.add',
  'scene.rename',
  'scene.duplicate',
  'scene.clear',
] as const;

/** Records one change, so the writers below read as a sentence. */
type RecordChange = (op: string, target: string, from: unknown, to: unknown) => void;

/**
 * The edit list, or a refusal naming the position that is not an edit.
 *
 * Read by hand rather than through `input.ts` because there is no list-of-objects
 * reader there, and there should not be: "the third edit is not an object" is a
 * better message than "edits must be a list of objects" whenever the shape is
 * mostly right.
 */
export function editList(input: ApiInput, key = 'edits'): ApiInput[] {
  const raw = input[key];
  if (!Array.isArray(raw) || raw.length === 0) {
    badInput(`"${key}" is required and must be a non-empty list of edits.`);
  }
  return (raw as unknown[]).map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      badInput(`${key} ${index + 1}: every edit must be an object with an "op".`);
    }
    return entry as ApiInput;
  });
}

/**
 * Apply every edit, in order, and report what each one did.
 *
 * The list is walked in the caller's order rather than sorted or grouped, because
 * a later edit is allowed to depend on an earlier one — set the channel's poly,
 * then write four notes into one of its cells — and reordering that would silently
 * change the meaning of a call.
 */
export function applyEdits(song: Song, edits: ApiInput[]): EditChange[] {
  const changes: EditChange[] = [];
  edits.forEach((edit, index) => {
    const where = `edit ${index + 1}`;
    const record: RecordChange = (op, target, from, to) => {
      const before = String(from);
      const after = String(to);
      changes.push({ edit: index + 1, op, target, from: before, to: after, changed: before !== after });
    };
    applyEdit(song, edit, where, record);
  });
  return changes;
}

/** Dispatch one edit to its writer. Every refusal carries the edit's number. */
function applyEdit(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const op = maybeStr(edit, 'op');
  if (op === null) refuse('invalid_input', `${where}: "op" is required — one of ${EDIT_OPS.join(', ')}.`);
  switch (op) {
    case 'song.set':
      return applySongSet(song, edit, where, record);
    case 'track.set':
      return applyTrackSet(song, edit, where, record);
    case 'machine.set':
      return applyMachineSet(song, edit, where, record);
    case 'pad.set':
      return applyPadSet(song, edit, where, record);
    case 'pad.step':
      return applyPadStep(song, edit, where, record);
    case 'machine.clear':
      return applyMachineClear(song, edit, where, record);
    case 'cell.set':
      return applyCellSet(song, edit, where, record);
    case 'cell.clear':
      return applyCellClear(song, edit, where, record);
    case 'pattern.clear':
      return applyPatternClear(song, edit, where, record);
    case 'order.set':
      return applyOrderSet(song, edit, where, record);
    case 'section.set':
      return applySectionSet(song, edit, where, record);
    case 'section.clear':
      return applySectionClear(song, edit, where, record);
    case 'arrange.set':
      return applyArrangeSet(song, edit, where, record);
    case 'bus.set':
      return applyBusSet(song, edit, where, record);
    case 'master.set':
      return applyMasterSet(song, edit, where, record);
    case 'arp.set':
      return applyArpSet(song, edit, where, record);
    case 'arp.clear':
      return applyArpClear(song, edit, where, record);
    case 'automation.set':
      return applyAutomationSet(song, edit, where, record);
    case 'automation.clear':
      return applyAutomationClear(song, edit, where, record);
    case 'scene.set':
      return applySceneSet(song, edit, where, record);
    case 'scene.add':
      return applySceneAdd(song, edit, where, record);
    case 'scene.rename':
      return applySceneRename(song, edit, where, record);
    case 'scene.duplicate':
      return applySceneDuplicate(song, edit, where, record);
    case 'scene.clear':
      return applySceneClear(song, edit, where, record);
    default:
      refuse('invalid_input', `${where}: "${op}" is not an edit this API knows. Use one of ${EDIT_OPS.join(', ')}.`);
  }
}

/** A number an edit requires, refusing with the edit's position. */
function required(edit: ApiInput, key: string, where: string): number {
  const value = maybeNumber(edit, key);
  if (value === null) refuse('invalid_input', `${where}: "${key}" is required and must be a number.`);
  return Math.round(value);
}

/** A note written as a name (`C-4`, `F#3`) or a MIDI number. */
function toMidi(raw: unknown, where: string): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw === 'string') {
    const named = noteNameToMidi(raw);
    if (named !== null) return named;
    const numbered = Number(raw);
    if (Number.isFinite(numbered)) return Math.round(numbered);
  }
  refuse('invalid_input', `${where}: "${String(raw)}" is not a note. Write a MIDI number or a name like "C-4" or "F#3".`);
}

/** A pattern by 1-based number, created on demand the way a script creates it. */
function patternFor(song: Song, edit: ApiInput, where: string) {
  const number = required(edit, 'pattern', where);
  if (number < 1) refuse('invalid_input', `${where}: "pattern" is 1-based, so it starts at 1.`);
  return ensurePattern(song, number);
}

/** A channel by 1-based number, refused rather than invented when there is none. */
function trackFor(song: Song, edit: ApiInput, where: string) {
  const number = required(edit, 'track', where);
  const track = song.tracks[number - 1];
  if (!track) {
    refuse('not_found', `${where}: this song has no channel ${number}; it has ${song.tracks.length}.`);
  }
  return track;
}

/** The song's own header: the fields a person changes without touching a cell. */
function applySongSet(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const title = maybeStr(edit, 'title');
  if (title !== null) {
    if (!isSongTitleLength(title)) refuse('invalid_input', `${where}: "${title}" is longer than a song title may be.`);
    const after = tidySongTitle(title);
    record('song.set', 'title', song.title, after);
    song.title = after;
  }

  const bpm = maybeNumber(edit, 'bpm');
  if (bpm !== null) {
    const after = clampBpm(bpm);
    record('song.set', 'tempo', song.bpm, after);
    song.bpm = after;
  }

  const key = maybeStr(edit, 'key');
  if (key !== null) {
    const parsed = parseKey(key);
    if (!parsed) {
      refuse('invalid_input', `${where}: "${key}" is not a key this language spells.`, [
        'write a tonic and a scale, e.g. "D minor", "F# dorian" or "A pentatonic".',
      ]);
    }
    record('song.set', 'key', keyName(song.key), keyName(parsed));
    song.key = parsed;
  }

  const swing = maybeNumber(edit, 'swing');
  if (swing !== null) {
    const after = clampSwing(swing);
    record('song.set', 'swing', song.swing, after);
    song.swing = after;
  }

  const rows = maybeNumber(edit, 'rows');
  if (rows !== null) {
    const after = clampRows(rows);
    // Read the old length out BEFORE resizing every pattern in the song.
    record('song.set', 'rows', patternRows(song), after);
    setPatternRows(song, after);
  }

  const beat = maybeNumber(edit, 'rowsPerBeat');
  if (beat !== null) {
    const after = clampRowsPerBeat(beat);
    record('song.set', 'rows per beat', song.rowsPerBeat, after);
    song.rowsPerBeat = after;
  }

  const groove = maybeStr(edit, 'groove');
  if (groove !== null) {
    const parsed = grooveFromName(groove);
    if (!parsed) refuse('invalid_input', `${where}: "${groove}" is not a groove. One of: ${grooveNames()}.`);
    record('song.set', 'groove', song.groove, parsed.id);
    song.groove = parsed.id;
  }

  const kit = maybeStr(edit, 'kit');
  if (kit !== null) {
    const parsed = kitFromName(kit);
    if (!parsed) refuse('invalid_input', `${where}: "${kit}" is not a drum kit. One of: ${kitNames().join(', ')}.`);
    record('song.set', 'kit', song.kit, parsed);
    song.kit = parsed;
  }

  // `room` and `echo` are the names the panel uses; the song calls them reverb
  // and echo. One word each, and the panel's is the one a person would say.
  const room = maybeNumber(edit, 'room');
  if (room !== null) {
    const after = clampRoom(room);
    record('song.set', 'room', song.reverb, after);
    song.reverb = after;
  }

  const echo = maybeNumber(edit, 'echo');
  if (echo !== null) {
    const after = clampRoom(echo);
    record('song.set', 'echo', song.echo, after);
    song.echo = after;
  }
}

/**
 * A recording an edit names, as a channel and a pad both take it.
 *
 * Absent leaves it alone, an empty string (or `none`) CLEARS it — the one value
 * whose empty is meaningful, like `bus` — and a name that could never be a name is
 * refused rather than quietly turning into the fallback. That split is the same one
 * `sample NAME` on a line makes: the BANK is the app's, so a name it does not have
 * is a valid fallback (`song.diff` and a reader must both allow it), while a name
 * with a space in it or one starting with a digit is a mistake about the line.
 */
function sampleEdit(edit: ApiInput, where: string): { set: boolean; value: string | null } {
  // Read RAW rather than through `maybeStr`, because `maybeStr` treats an empty
  // string as "not given" — and for this ONE field an empty string is the whole
  // point, the way a bus's is. `undefined`/`null` still mean "leave it".
  const raw = edit['sample'];
  if (raw === undefined || raw === null) return { set: false, value: null };
  if (typeof raw !== 'string') refuse('invalid_input', `${where}: "sample", when given, must be a string.`);
  const wanted = raw.trim();
  if (wanted === '' || sameSampleName(wanted, NO_SAMPLE_WORD)) return { set: true, value: null };
  const problem = sampleNameProblem(wanted);
  if (problem !== null) {
    refuse('invalid_input', `${where}: "sample" must be the name of a recording, e.g. "BRK02" — ${problem}. Or "" to leave the one it has.`);
  }
  return { set: true, value: tidySampleName(wanted) };
}

/** One channel: its name, its place in the mix, and how it plays. */
function applyTrackSet(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const track = trackFor(song, edit, where);
  const at = `channel ${song.tracks.indexOf(track) + 1}`;

  const name = maybeStr(edit, 'name');
  if (name !== null) {
    if (!isTrackNameLength(name)) refuse('invalid_input', `${where}: "${name}" is longer than a channel name may be.`);
    const after = tidyTrackName(name);
    record('track.set', `${at} name`, track.name, after);
    track.name = after;
  }

  const level = maybeNumber(edit, 'level');
  if (level !== null) {
    const after = clampLevel(level);
    record('track.set', `${at} level`, track.level, after);
    track.level = after;
  }

  const pan = maybeNumber(edit, 'pan');
  if (pan !== null) {
    const after = clampPan(pan);
    record('track.set', `${at} pan`, track.pan, after);
    track.pan = after;
  }

  const hold = maybeNumber(edit, 'hold');
  if (hold !== null) {
    const after = clampHold(hold);
    record('track.set', `${at} hold`, track.hold, after);
    track.hold = after;
  }

  const glide = maybeNumber(edit, 'glide');
  if (glide !== null) {
    const after = clampGlide(glide);
    record('track.set', `${at} glide`, track.glide, after);
    track.glide = after;
  }

  const vibrato = maybeNumber(edit, 'vibrato');
  if (vibrato !== null) {
    const after = clampVibrato(vibrato);
    record('track.set', `${at} vibrato`, track.vibrato, after);
    track.vibrato = after;
  }

  const verb = maybeNumber(edit, 'verb');
  if (verb !== null) {
    const after = clampSend(verb);
    record('track.set', `${at} reverb send`, track.verb, after);
    track.verb = after;
  }

  const echo = maybeNumber(edit, 'echo');
  if (echo !== null) {
    const after = clampSend(echo);
    record('track.set', `${at} echo send`, track.echo, after);
    track.echo = after;
  }

  // A channel's DUCK, the last of the four mix numbers a strip carries.
  const duck = maybeNumber(edit, 'duck');
  if (duck !== null) {
    const after = clampDuck(duck);
    record('track.set', `${at} duck`, track.duck, after);
    track.duck = after;
  }

  // The channel's ten EFFECTS, only the ones the edit named, so an effect it left
  // out keeps whatever the channel had — the same rule a `track` line's effects
  // follow.
  const effects = maybeObject(edit, 'effects');
  if (effects) {
    const before = TRACK_EFFECTS.map((effect) => `${effect.id} ${track[effect.id]}`).join(', ');
    const clamped = clampEffects(effects as Partial<ChannelEffects>);
    for (const effect of TRACK_EFFECTS) {
      if (effects[effect.id] !== undefined) track[effect.id] = clamped[effect.id];
    }
    const after = TRACK_EFFECTS.map((effect) => `${effect.id} ${track[effect.id]}`).join(', ');
    record('track.set', `${at} effects`, before, after);
  }

  // The mix GROUP a channel joins, or an empty string to leave the one it is on
  // — the one field whose empty is meaningful. A non-empty name must be declared,
  // exactly as `track 1 bus DRUMS` insists, so an edit cannot invent a group the
  // song's own mixer does not have.
  const bus = maybeStr(edit, 'bus');
  if (bus !== null) {
    const wanted = bus.trim();
    let joined: string | null = null;
    if (!(wanted === '' || sameBusName(wanted, NO_BUS_WORD))) {
      const found = song.buses.find((one) => sameBusName(one.name, wanted));
      if (!found) {
        const have = song.buses.length === 0 ? 'the song has no buses yet' : `the song has: ${busNames(song.buses).join(', ')}`;
        refuse('invalid_input', `${where}: ${at} joins a bus the song does not have: "${wanted}" — ${have}.`);
      }
      joined = found.name;
    }
    record('track.set', `${at} bus`, track.bus ?? NO_BUS_WORD, joined ?? NO_BUS_WORD);
    track.bus = joined;
  }

  const poly = maybeNumber(edit, 'poly');
  if (poly !== null) {
    const after = clampPoly(poly);
    record('track.set', `${at} polyphony`, track.poly, after);
    track.poly = after;
  }

  const muted = maybeBool(edit, 'muted');
  if (muted !== null) {
    record('track.set', `${at} muted`, track.muted, muted);
    track.muted = muted;
  }

  const sample = sampleEdit(edit, where);
  if (sample.set) {
    record('track.set', `${at} sample`, track.sample ?? NO_SAMPLE_WORD, sample.value ?? NO_SAMPLE_WORD);
    track.sample = sample.value;
  }
}

/**
 * A group fader — `bus.set`, the GROUPS panel's one control.
 *
 * One edit for the two things `bus DRUMS 70` does at once: DEFINE a group, or MOVE
 * the one that already has that name. The name is checked the way the language
 * checks it (`busNameProblem`), so a name with a space in it is refused rather
 * than silently rewritten into a different group.
 */
function applyBusSet(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const rawName = maybeStr(edit, 'name');
  if (rawName === null) refuse('invalid_input', `${where}: "bus.set" needs a "name", e.g. "DRUMS".`);
  const problem = busNameProblem(rawName);
  if (problem !== null) refuse('invalid_input', `${where}: ${problem}`);
  const name = tidyBusName(rawName);
  const existing = song.buses.find((one) => sameBusName(one.name, name));
  if (!existing && song.buses.length >= MAX_BUSES) {
    const have = busNames(song.buses).length > 0 ? ` (${busNames(song.buses).join(', ')})` : '';
    refuse('invalid_input', `${where}: a song may have at most ${MAX_BUSES} buses, and this one already has ${MAX_BUSES}${have}.`);
  }
  const level = maybeNumber(edit, 'level');
  if (level === null) refuse('invalid_input', `${where}: "bus.set" needs a "level" 0..100, e.g. 70.`);
  const after = clampBusLevel(level);
  record('bus.set', `bus ${name}`, existing ? existing.level : '(none)', after);
  song.buses = withBus(song.buses, { name, level: after });
}

/**
 * The effects on the WHOLE MIX — `master.set`, the MIXER's own last panel.
 *
 * The same ten effects a channel has, at the other end of the same graph, so the
 * words are the same and only the scope differs. Only the effects the edit named
 * move; the rest keep their value.
 */
function applyMasterSet(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const effects = maybeObject(edit, 'effects');
  if (!effects) refuse('invalid_input', `${where}: "master.set" needs an "effects" object, e.g. {"drive": 20}.`);
  const before = TRACK_EFFECTS.map((effect) => `${effect.id} ${song.master[effect.id]}`).join(', ');
  const clamped = clampEffects(effects as Partial<typeof song.master>);
  for (const effect of TRACK_EFFECTS) {
    if (effects[effect.id] !== undefined) song.master[effect.id] = clamped[effect.id];
  }
  const after = TRACK_EFFECTS.map((effect) => `${effect.id} ${song.master[effect.id]}`).join(', ');
  record('master.set', 'whole mix effects', before, after);
}

/**
 * The ARP page's five dials — `arp.set`, the one editor for a stored run's shape.
 *
 * The dials are SONG data, so they are written the way every other field is: only
 * the ones the edit named move (and a first edit on a song with no dials merges
 * over `DEFAULT_ARP`, exactly as an `arp …` line does), a word that is not a
 * direction or a mode is REFUSED by name — a typo about a closed list is a mistake,
 * not a taste — and the three numbers are clamped by the model's own `clampArp`, so
 * an edit can never store a run the page, the file and the script would each
 * refuse. The change log carries the whole label, so a caller reads the run it set.
 */
function applyArpSet(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const partial: Partial<ArpSettings> = {};

  const rawDirection = maybeStr(edit, 'direction');
  if (rawDirection !== null) {
    const direction = arpDirectionFromName(rawDirection);
    if (direction === null) {
      refuse('invalid_input', `${where}: "${rawDirection}" is not an arp direction. The directions are: ${ARP_DIRECTIONS.join(', ')}.`);
    }
    partial.direction = direction;
  }

  const rawMode = maybeStr(edit, 'mode');
  if (rawMode !== null) {
    const mode = rawMode.trim().toLowerCase();
    if (!ARP_MODES.includes(mode as ArpMode)) {
      refuse('invalid_input', `${where}: "${rawMode}" is not an arp mode. The modes are: ${ARP_MODES.join(', ')}.`);
    }
    partial.mode = mode as ArpMode;
  }

  for (const key of ['octaves', 'rate', 'gate'] as const) {
    const value = maybeNumber(edit, key);
    if (value !== null) partial[key] = Math.round(value);
  }

  if (Object.keys(partial).length === 0) {
    refuse('invalid_input', `${where}: "arp.set" needs at least one dial — direction, octaves, rate, gate or mode.`);
  }

  const before = song.arp;
  const next = clampArp({ ...(before ?? DEFAULT_ARP), ...partial });
  song.arp = next;
  record('arp.set', 'arp dials', before ? arpLabel(before) : '(none)', arpLabel(next));
}

/**
 * Clear the stored dials — `arp.clear`, the counterpart of `arp off`.
 *
 * A song with no dials once again writes no `arp` key and no new file version,
 * exactly as it did before the page existed; the written NOTES stay where they are,
 * because an arp is cells once written rather than a link back to its dials.
 */
function applyArpClear(song: Song, _edit: ApiInput, _where: string, record: RecordChange): void {
  const before = song.arp;
  song.arp = null;
  record('arp.clear', 'arp dials', before ? arpLabel(before) : '(none)', '(none)');
}

/**
 * One automation lane — the ARRANGER's drawn curve, as one edit.
 *
 * A lane names a CHANNEL, one thing to move, where the value starts, where it
 * ends, and the bars it spans, exactly as the `automate` line does; `tidyLane`
 * then clamps every field into the range its own table allows, the same way the
 * parser does, so an edit cannot write a lane the language would refuse.
 *
 * The lane is addressed by `index` (1-based) when the caller wants to MOVE one
 * that already exists, and appended when it is left out — which is the difference
 * between "change that riser" and "add a riser", and it is what lets `song.diff`
 * express a moved lane as one edit rather than a clear-and-re-add.
 */
function applyAutomationSet(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const raw = maybeStr(edit, 'target');
  if (raw === null) {
    refuse('invalid_input', `${where}: "automation.set" needs a "target" — one of ${AUTOMATION_TARGET_WORDS.join(', ')}.`);
  }
  const target = raw.trim().toLowerCase();
  if (!isAutomationTarget(target)) {
    refuse('invalid_input', `${where}: "${raw}" is not something a lane can move. One of: ${AUTOMATION_TARGET_WORDS.join(', ')}.`);
  }
  const track = required(edit, 'track', where);
  if (track < 1 || track > song.tracks.length) {
    refuse('invalid_input', `${where}: this song has ${song.tracks.length} channels, so "track" must be 1..${song.tracks.length}.`);
  }
  const from = required(edit, 'from', where);
  const to = required(edit, 'to', where);
  const startBar = required(edit, 'startBar', where);
  const endBar = required(edit, 'endBar', where);
  if (startBar > endBar) {
    refuse('invalid_input', `${where}: "startBar" must not be after "endBar" (got ${startBar} > ${endBar}); a lane runs from an earlier bar to a later one.`);
  }

  // Clamp here rather than trusting the numbers, exactly as `automate` does — a
  // bar past the end or a value off its range becomes the nearest legal one, so
  // the lane the caller reads back is a lane the language would also accept.
  const lane: AutomationLane = tidyLane({ track, target, from, to, startBar, endBar });
  const lanes = song.automation;
  const indexRaw = maybeNumber(edit, 'index');
  let index: number;
  if (indexRaw === null) {
    if (lanes.length >= MAX_AUTOMATION_LANES) {
      refuse('invalid_input', `${where}: a song may have at most ${MAX_AUTOMATION_LANES} lanes, and this one already has ${MAX_AUTOMATION_LANES}. Clear one first.`);
    }
    index = lanes.length;
  } else {
    const position = Math.round(indexRaw);
    if (position < 1 || position > lanes.length + 1) {
      refuse('not_found', `${where}: this song has ${lanes.length} lanes, so "index" must be 1..${lanes.length + 1} (the last one appends).`);
    }
    index = position - 1;
  }
  const existing = lanes[index];
  const next = lanes.slice();
  next[index] = lane;
  song.automation = next;
  record(
    'automation.set',
    existing ? `lane ${index + 1}` : `lane ${index + 1} (added)`,
    existing ? laneLabel(existing) : '(none)',
    laneLabel(lane),
  );
}

/**
 * Drop one lane by its 1-based position, or every lane when no index is given.
 *
 * The index is what makes a lane addressable at all: a lane is a value moving
 * over bars rather than a named thing, so its position in the list — the reading
 * order `sortAutomationLanes` keeps — is the handle a caller and a diff both use.
 */
function applyAutomationClear(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const lanes = song.automation;
  const indexRaw = maybeNumber(edit, 'index');
  if (indexRaw === null) {
    record('automation.clear', 'all lanes', `${lanes.length} lanes`, '0 lanes');
    song.automation = [];
    return;
  }
  const position = Math.round(indexRaw);
  if (position < 1 || position > lanes.length) {
    refuse('not_found', `${where}: this song has ${lanes.length} lanes, so "index" must be 1..${lanes.length}.`);
  }
  const removed = lanes[position - 1] as AutomationLane;
  song.automation = lanes.filter((_lane, at) => at !== position - 1);
  record('automation.clear', `lane ${position}`, laneLabel(removed), '(removed)');
}

/**
 * The clips a scene edit names, as the model's own list: one 1-based pattern number
 * or `null` per channel.
 *
 * The list is read the same way a `scene` line reads its clips — `0`, `-`, `null`
 * and a missing value are all silence, and a number is clamped into the pattern
 * range — but it is NOT cut to the song's channel count here: `withScene` fits it,
 * so a caller may name fewer channels and let the rest stay silent.
 */
function sceneClips(edit: ApiInput, where: string): (number | null)[] {
  const raw = edit['clips'];
  if (!Array.isArray(raw)) {
    refuse('invalid_input', `${where}: "clips" is required — one entry per channel, a pattern number or null for silence, e.g. [1, 2, null, 3].`);
  }
  return (raw as unknown[]).map((entry) => {
    if (entry === null || entry === undefined || entry === '-' || entry === '') return null;
    if (typeof entry === 'number' && Number.isFinite(entry)) return clampSceneClip(entry);
    refuse('invalid_input', `${where}: "clips" must hold pattern numbers or null for silence; got ${JSON.stringify(entry)}.`);
  });
}

/** The machine bar a scene edit names, or `null` when it names none. */
function sceneMachine(edit: ApiInput, where: string): number | null {
  const raw = edit['machine'];
  if (raw === undefined || raw === null) return null;
  if (raw === 'off' || raw === 'none') return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    refuse('invalid_input', `${where}: "machine" must be a drum-machine bar 1..${MAX_MACHINE_BARS}, or null to sit the machine out.`);
  }
  return clampSceneBar(raw as number);
}

/** A scene by name, as `scene.set`/`scene.rename`/`scene.duplicate` need one. */
function requiredSceneName(edit: ApiInput, where: string, key = 'name'): string {
  const raw = maybeStr(edit, key);
  if (raw === null) refuse('invalid_input', `${where}: "${key}" is required — the scene to address, e.g. "VERSE".`);
  const problem = sceneNameProblem(raw);
  if (problem !== null) refuse('invalid_input', `${where}: ${problem}`);
  return tidySceneName(raw);
}

/**
 * Define or REPLACE a scene by name — one row of the LIVE page's launch grid.
 *
 * The row is (re)defined whole: the pattern each channel plays, with `null` for a
 * channel that is silent, and the drum-machine bar the scene performs. A name that
 * already exists is replaced in place, exactly as `scene A 1 1 - 2` twice means
 * "scene A is this now".
 */
function applySceneSet(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const name = requiredSceneName(edit, where);
  const clips = sceneClips(edit, where);
  const machine = sceneMachine(edit, where);
  const existing = sceneByName(song.scenes, name);
  if (!existing && song.scenes.length >= MAX_SCENES) {
    refuse('invalid_input', `${where}: a song may hold at most ${MAX_SCENES} scenes, and this one already has ${MAX_SCENES}. Clear one first.`);
  }
  const before = existing ? sceneLabel(existing) : '(none)';
  song.scenes = withScene(song.scenes, { name, clips, machine }, song.tracks.length);
  const after = sceneLabel(sceneByName(song.scenes, name) as NonNullable<ReturnType<typeof sceneByName>>);
  record('scene.set', `scene ${sceneNameSpelling(name)}`, before, after);
}

/**
 * Append an empty scene, with a unique name when none is given.
 *
 * `+ SCENE` as an edit: a created row starts with every channel silent and no
 * machine bar, so a caller can add a row and then fill it in with `scene.set`.
 */
function applySceneAdd(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  if (song.scenes.length >= MAX_SCENES) {
    refuse('invalid_input', `${where}: a song may hold at most ${MAX_SCENES} scenes, and this one already has ${MAX_SCENES}.`);
  }
  const raw = maybeStr(edit, 'name');
  if (raw !== null && sceneNameProblem(raw) !== null) refuse('invalid_input', `${where}: ${sceneNameProblem(raw)}`);
  const added = addScene(song.scenes, song.tracks.length);
  const created = added[added.length - 1];
  const name = raw === null ? created.name : tidySceneName(raw);
  // A named add is just a create-then-rename, so a caller can pick the name.
  song.scenes = withScene(added, { name, clips: created.clips, machine: created.machine ?? null }, song.tracks.length);
  // The first (unnamed) scene keeps its position; a named one replaces the fresh
  // row rather than adding a second.
  if (raw !== null) song.scenes = withoutScene(song.scenes, created.name);
  record('scene.add', 'scenes', '(none)', `scene ${sceneNameSpelling(name)}`);
}

/** Rename a scene in place, collapsing a collision the way the model does. */
function applySceneRename(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const from = requiredSceneName(edit, where);
  const to = requiredSceneName(edit, where, 'to');
  const existing = sceneByName(song.scenes, from);
  if (!existing) {
    const have = song.scenes.length === 0 ? 'this song has none yet' : `this song has: ${song.scenes.map((one) => one.name).join(', ')}`;
    refuse('not_found', `${where}: this song has no scene "${from}" — ${have}.`);
  }
  song.scenes = renameScene(song.scenes, from, to);
  record('scene.rename', `scene ${sceneNameSpelling(from)}`, from, to);
}

/** Copy a scene under a fresh (or named) row, right after it. */
function applySceneDuplicate(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const from = requiredSceneName(edit, where);
  const at = song.scenes.findIndex((one) => one.name === from);
  if (at < 0) {
    const have = song.scenes.length === 0 ? 'this song has none yet' : `this song has: ${song.scenes.map((one) => one.name).join(', ')}`;
    refuse('not_found', `${where}: this song has no scene "${from}" — ${have}.`);
  }
  if (song.scenes.length >= MAX_SCENES) {
    refuse('invalid_input', `${where}: a song may hold at most ${MAX_SCENES} scenes, and this one already has ${MAX_SCENES}.`);
  }
  const raw = maybeStr(edit, 'to');
  if (raw !== null && sceneNameProblem(raw) !== null) refuse('invalid_input', `${where}: ${sceneNameProblem(raw)}`);
  const added = duplicateScene(song.scenes, at, song.tracks.length);
  const copy = added[at + 1];
  if (raw === null) {
    song.scenes = added;
    record('scene.duplicate', `scene ${sceneNameSpelling(from)}`, from, copy.name);
    return;
  }
  const name = tidySceneName(raw);
  song.scenes = renameScene(added, copy.name, name);
  record('scene.duplicate', `scene ${sceneNameSpelling(from)}`, from, name);
}

/**
 * Remove a scene by name, or EVERY scene when no name is given.
 *
 * The whole-list form is the counterpart of `automation.clear`: one word to empty
 * the launch grid, which is how a caller resets a set without removing rows one at
 * a time.
 */
function applySceneClear(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const raw = maybeStr(edit, 'name');
  if (raw === null) {
    record('scene.clear', 'scenes', `${song.scenes.length} scenes`, '0 scenes');
    song.scenes = [];
    return;
  }
  if (sceneNameProblem(raw) !== null) refuse('invalid_input', `${where}: ${sceneNameProblem(raw)}`);
  const name = tidySceneName(raw);
  if (!sceneByName(song.scenes, name)) {
    const have = song.scenes.length === 0 ? 'this song has none yet' : `this song has: ${song.scenes.map((one) => one.name).join(', ')}`;
    refuse('not_found', `${where}: this song has no scene "${name}" — ${have}.`);
  }
  song.scenes = withoutScene(song.scenes, name);
  record('scene.clear', `scene ${sceneNameSpelling(name)}`, name, '(removed)');
}

/**
 * A cell's feel, as the log writes it when the note itself did not move.
 *
 * Without this a velocity-only change — which `song.diff` produces and a person
 * asks for constantly — would be logged as `D-5 -> D-5`, which reads as a no-op and
 * is not one. The token is the note; the velocity is the rest of what a step is.
 */
function feelText(cell: Cell): string {
  const bits = [`v${cell.velocity}`];
  if (cell.slide) bits.push('slide');
  if (cell.stutter > 1) bits.push(`x${cell.stutter}`);
  return bits.join(' ');
}

/** One step: notes or a drum, and the per-note feel beside them. */
function applyCellSet(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const pattern = patternFor(song, edit, where);
  const row = required(edit, 'row', where);
  const track = trackFor(song, edit, where);
  const trackIndex = song.tracks.indexOf(track);
  const cell = pattern.steps[row]?.[trackIndex];
  if (!cell) {
    refuse('not_found', `${where}: this pattern has ${pattern.steps.length} steps, so "row" must be 0..${pattern.steps.length - 1}.`);
  }

  const target = `pattern ${song.patterns.indexOf(pattern) + 1} row ${row} channel ${trackIndex + 1}`;
  const before = cellText(cell);
  const beforeFeel = feelText(cell);

  const drum = maybeStr(edit, 'drum');
  const single = edit.note;
  const many = edit.notes;
  const writesNotes = (single !== undefined && single !== null) || Array.isArray(many);

  if (drum !== null && writesNotes) {
    refuse('invalid_input', `${where}: a step is a note, a chord or a drum, never two — set "drum" or "note"/"notes", not both.`);
  }

  if (drum !== null) {
    const id = DRUM_IDS.find((candidate) => candidate === drum.trim().toLowerCase()) as DrumId | undefined;
    if (!id) refuse('invalid_input', `${where}: "${drum}" is not one of the drums: ${DRUM_IDS.join(', ')}.`);
    setCellDrum(cell, id);
  } else if (writesNotes) {
    const raw = Array.isArray(many) ? many : [single];
    const notes = raw.map((value) => toMidi(value, where));
    setCellNotes(cell, notes);
  }

  const velocity = maybeNumber(edit, 'velocity');
  if (velocity !== null) cell.velocity = clampVelocity(velocity);

  const slide = maybeBool(edit, 'slide');
  if (slide !== null) cell.slide = slide;

  const stutter = maybeNumber(edit, 'stutter');
  if (stutter !== null) cell.stutter = clampStutter(stutter);

  const after = cellText(cell);
  // The token is the note. When only the feel moved the token is unchanged, so
  // the log says the velocity instead — the thing that actually moved.
  record(
    'cell.set',
    target,
    before === after ? `${before} ${beforeFeel}` : before,
    before === after ? `${after} ${feelText(cell)}` : after,
  );
}

/** One step, back to empty. */
function applyCellClear(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const pattern = patternFor(song, edit, where);
  const row = required(edit, 'row', where);
  const track = trackFor(song, edit, where);
  const trackIndex = song.tracks.indexOf(track);
  const cell: Cell | undefined = pattern.steps[row]?.[trackIndex];
  if (!cell) {
    refuse('not_found', `${where}: this pattern has ${pattern.steps.length} steps, so "row" must be 0..${pattern.steps.length - 1}.`);
  }
  const before = cellText(cell);
  clearCell(pattern, row, trackIndex);
  record('cell.clear', `pattern ${song.patterns.indexOf(pattern) + 1} row ${row} channel ${trackIndex + 1}`, before, cellText(cell));
}

/** Every step in one pattern. */
function applyPatternClear(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const pattern = patternFor(song, edit, where);
  const before = countNotes(pattern);
  clearPattern(pattern);
  record('pattern.clear', `pattern ${song.patterns.indexOf(pattern) + 1}`, `${before} notes`, `${countNotes(pattern)} notes`);
}

/** The arrangement: which pattern plays in each slot. */
function applyOrderSet(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const list = edit.order;
  if (!Array.isArray(list) || list.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
    refuse('invalid_input', `${where}: "order" must be a list of pattern numbers, e.g. [1, 1, 2, 1].`);
  }
  const before = song.order.join(' ');
  setOrder(song, list as number[]);
  record('order.set', 'order', before, song.order.join(' '));
}

/**
 * The machine, creating it on first mention the way a `machine` or `pad` line
 * does.
 *
 * A machine is not a thing you have to declare before editing: the first edit
 * about it calls it into being with the four kit pads, which is what lets
 * `pad 5 "TOM"` work on a song that never named pads 1-4. Every writer below
 * goes through here, so "the machine exists" is one rule rather than four.
 */
function machineFor(song: Song, steps?: number | null): DrumMachine {
  if (song.machine) return song.machine;
  song.machine = createMachine(steps ?? DEFAULT_MACHINE_STEPS);
  return song.machine;
}

/** The machine's own mix and clock — the instrument, not the beat. */
function applyMachineSet(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const machine = machineFor(song, maybeNumber(edit, 'steps'));

  const enabled = maybeBool(edit, 'enabled');
  if (enabled !== null) {
    record('machine.set', 'machine on', machine.enabled, enabled);
    machine.enabled = enabled;
  }

  const beat = maybeNumber(edit, 'beat');
  if (beat !== null) {
    const after = clampMachineBeat(beat);
    record('machine.set', 'machine beat', machine.beat, after);
    machine.beat = after;
  }

  const swing = maybeNumber(edit, 'swing');
  if (swing !== null) {
    const after = clampSwing(swing);
    record('machine.set', 'machine swing', machine.swing, after);
    machine.swing = after;
  }

  const level = maybeNumber(edit, 'level');
  if (level !== null) {
    const after = clampLevel(level);
    record('machine.set', 'machine level', machine.level, after);
    machine.level = after;
  }

  const pan = maybeNumber(edit, 'pan');
  if (pan !== null) {
    const after = clampPan(pan);
    record('machine.set', 'machine pan', machine.pan, after);
    machine.pan = after;
  }

  const verb = maybeNumber(edit, 'verb');
  if (verb !== null) {
    const after = clampSend(verb);
    record('machine.set', 'machine reverb send', machine.verb, after);
    machine.verb = after;
  }

  const echo = maybeNumber(edit, 'echo');
  if (echo !== null) {
    const after = clampSend(echo);
    record('machine.set', 'machine echo send', machine.echo, after);
    machine.echo = after;
  }

  const duck = maybeNumber(edit, 'duck');
  if (duck !== null) {
    const after = clampDuck(duck);
    record('machine.set', 'machine duck', machine.duck, after);
    machine.duck = after;
  }

  // `bus` is the one field whose EMPTY is meaningful: an empty string leaves the
  // bus, which is how a caller undoes a join. A non-empty name must be declared,
  // exactly as `machine bus DRUMS` insists, so an edit cannot invent a bus the
  // song's own mixer does not have.
  const bus = maybeStr(edit, 'bus');
  if (bus !== null) {
    const wanted = bus.trim();
    let joined: string | null = null;
    if (!(wanted === '' || sameBusName(wanted, NO_BUS_WORD))) {
      const found = song.buses.find((one) => sameBusName(one.name, wanted));
      if (!found) {
        const have = song.buses.length === 0 ? 'the song has no buses yet' : `the song has: ${busNames(song.buses).join(', ')}`;
        refuse('invalid_input', `${where}: the machine joins a bus the song does not have: "${wanted}" — ${have}.`);
      }
      joined = found.name;
    }
    record('machine.set', 'machine bus', machine.bus ?? NO_BUS_WORD, joined ?? NO_BUS_WORD);
    machine.bus = joined;
  }

  const effects = maybeObject(edit, 'effects');
  if (effects) {
    const before = TRACK_EFFECTS.map((effect) => `${effect.id} ${machine.effects[effect.id]}`).join(', ');
    const clamped = clampEffects(effects as Partial<typeof machine.effects>);
    for (const effect of TRACK_EFFECTS) {
      if (effects[effect.id] !== undefined) machine.effects[effect.id] = clamped[effect.id];
    }
    const after = TRACK_EFFECTS.map((effect) => `${effect.id} ${machine.effects[effect.id]}`).join(', ');
    record('machine.set', 'machine effects', before, after);
  }

  // Steps LAST, so a machine that grows or shrinks does it after the mix is set
  // and every pad row is resized in step — the same order `machine steps N` uses.
  const steps = maybeNumber(edit, 'steps');
  if (steps !== null) {
    const after = clampMachineSteps(steps);
    record('machine.set', 'machine steps', machine.steps, after);
    const resized = resizeMachine(machine, after);
    machine.steps = resized.steps;
    machine.pads = resized.pads;
    // Every BAR moves with the machine too, so the field and every row — bar 1
    // included — cannot disagree about how long a bar is.
    machine.bars = resized.bars;
  }

  // How many PADS the machine has: `+ ADD PAD` and `DEL PAD` as one number. Growing
  // fills in the kit pads the way `pad N` does; shrinking drops from the END and
  // takes each pad's row off every bar with it, exactly as `DEL PAD` does, so the
  // bars never keep a ghost row for a sound the song no longer has.
  const pads = maybeNumber(edit, 'pads');
  if (pads !== null) {
    const wanted = Math.round(pads);
    if (wanted < 1 || wanted > MAX_PADS) {
      refuse('invalid_input', `${where}: "pads" must be 1..${MAX_PADS} (a machine holds at most ${MAX_PADS} pads); got ${wanted}.`);
    }
    const live = song.machine as DrumMachine;
    const had = live.pads.length;
    if (wanted > had) {
      let grown = live;
      for (let index = had + 1; index <= wanted; index += 1) {
        grown = withPad(grown, index, defaultPad(index, grown.steps));
      }
      song.machine = grown;
    } else if (wanted < had) {
      song.machine = {
        ...live,
        pads: live.pads.slice(0, wanted),
        bars: live.bars.map((bar) => bar.slice(0, wanted)),
      };
    }
    record('machine.set', 'machine pads', had, wanted);
  }

  // How many BARS the machine has: `+ BAR` and `- BAR` as one number. Growing
  // COPIES the last bar, the way `+ BAR` does — a variation, not a blank — and
  // shrinking drops from the end, with bar 1 the machine and never going.
  const bars = maybeNumber(edit, 'bars');
  if (bars !== null) {
    const wanted = Math.round(bars);
    if (wanted < 1 || wanted > MAX_MACHINE_BARS) {
      refuse('invalid_input', `${where}: "bars" must be 1..${MAX_MACHINE_BARS} (a machine holds at most ${MAX_MACHINE_BARS} bars); got ${wanted}.`);
    }
    let live = song.machine as DrumMachine;
    const had = machineBarCount(live);
    while (machineBarCount(live) < wanted) live = addMachineBar(live);
    while (machineBarCount(live) > wanted) live = removeMachineBar(live, machineBarCount(live));
    song.machine = live;
    record('machine.set', 'machine bars', had, machineBarCount(live));
  }

  // The ORDER: which bar plays in each song bar, looping. Last, like `steps`, so
  // it lands on the machine the edits above left behind.
  const order = edit['order'];
  if (order !== undefined && order !== null) {
    if (!Array.isArray(order) || order.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
      refuse('invalid_input', `${where}: "order" must be a list of machine bar numbers, e.g. [1, 1, 2, 2]. Use [] to play bar 1 everywhere.`);
    }
    const live = song.machine as DrumMachine;
    const before = live.order.join(' ');
    song.machine = setMachineOrder(live, order as number[]);
    record('machine.set', 'machine order', before === '' ? '(none)' : before, song.machine.order.join(' ') === '' ? '(none)' : song.machine.order.join(' '));
  }
}

/** A pad by 1-based number, refused rather than clamped past the end. */
function padFor(song: Song, index: number, where: string): DrumPad {
  if (index < 1 || index > MAX_PADS) {
    refuse('invalid_input', `${where}: "pad" is 1..${MAX_PADS} (a machine has at most ${MAX_PADS} pads); got ${index}.`);
  }
  return padAt(machineFor(song), index) ?? defaultPad(index, machineFor(song).steps);
}

/** One pad: its name, its sound, its place in the mix, and its whole row. */
function applyPadSet(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const index = required(edit, 'pad', where);
  const machine = machineFor(song);
  const existing = padFor(song, index, where);
  const at = `pad ${index}`;
  // Copied so the voice and the row are written without touching the pad the
  // caller handed in — the same ownership rule every writer here follows.
  const next: DrumPad = { ...existing, voice: copyVoice(existing.voice), steps: existing.steps.slice() };

  const name = maybeStr(edit, 'name');
  if (name !== null) {
    const after = tidyPadName(name);
    if (after === '') refuse('invalid_input', `${where}: a pad name cannot be empty.`);
    record('pad.set', `${at} name`, next.name, after);
    next.name = after;
  }

  const level = maybeNumber(edit, 'level');
  if (level !== null) {
    const after = clampLevel(level);
    record('pad.set', `${at} level`, next.level, after);
    next.level = after;
  }

  const pan = maybeNumber(edit, 'pan');
  if (pan !== null) {
    const after = clampPan(pan);
    record('pad.set', `${at} pan`, next.pan, after);
    next.pan = after;
  }

  // Tuning is measured from the pad's KIT pitch, so `tune -4` means the same note
  // however many times it is written — the rule a `pad N tune -4` line follows.
  const tune = maybeNumber(edit, 'tune');
  if (tune !== null) {
    const after = clampMidi(defaultPad(index, machine.steps).pitch + clampTune(tune));
    record('pad.set', `${at} pitch`, next.pitch, after);
    next.pitch = after;
  }

  const voice = maybeStr(edit, 'voice');
  if (voice !== null) {
    const preset = voiceById(voice);
    if (!preset) {
      refuse('invalid_input', `${where}: "${voice}" is not a voice this build has.`, [
        'write a voice name, e.g. "lead", "bass", "pad" or one of the drums.',
      ]);
    }
    next.voice = copyVoice(preset.params);
    record('pad.set', `${at} voice`, next.name, preset.label);
  }

  const wave = maybeStr(edit, 'wave');
  if (wave !== null) {
    const parsed = waveFromName(wave);
    if (!parsed) refuse('invalid_input', `${where}: "${wave}" is not a wave this build has.`);
    record('pad.set', `${at} wave`, next.voice.wave, parsed);
    next.voice.wave = parsed;
  }

  const sample = sampleEdit(edit, where);
  if (sample.set) {
    record('pad.set', `${at} sample`, next.sample ?? NO_SAMPLE_WORD, sample.value ?? NO_SAMPLE_WORD);
    next.sample = sample.value;
  }

  for (const param of VOICE_PARAMS) {
    const value = maybeNumber(edit, param.id);
    if (value === null) continue;
    const after = clampParam(value);
    record('pad.set', `${at} ${param.label.toLowerCase()}`, next.voice[param.id], after);
    next.voice[param.id] = after;
  }

  // The pad's instrument and its bar-1 row travel together through `withPad`; a
  // row on any OTHER bar goes through `withMachineBar`, because a bar holds HITS
  // while name, sound, level, pan, pitch and sample are one shared instrument.
  let machineAfter = withPad(machine, index, next);
  const bar = barFor(edit);
  const pattern = maybeStr(edit, 'pattern');
  if (pattern !== null) {
    const parsed = parsePadPattern(pattern, machine.steps, next.name);
    if (!parsed.ok) refuse('invalid_input', `${where}: ${parsed.message}`);
    const wasRow = machineBarRows(machine, bar)[index - 1] ?? [];
    record(
      'pad.set',
      bar > 1 ? `${at} bar ${bar} pattern` : `${at} pattern`,
      padPatternString(wasRow, machine.steps),
      padPatternString(parsed.row, machine.steps),
    );
    const rows = machineBarRows(machineAfter, bar);
    rows[index - 1] = parsed.row;
    machineAfter = withMachineBar(machineAfter, bar, rows);
  }

  song.machine = machineAfter;
}

/** One step of one pad: a velocity, or a rest. The finest grain an edit has. */
function applyPadStep(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const index = required(edit, 'pad', where);
  const machine = machineFor(song);
  const existing = padFor(song, index, where);
  const step = required(edit, 'step', where);
  if (step < 0 || step >= machine.steps) {
    refuse('not_found', `${where}: this machine has ${machine.steps} steps, so "step" must be 0..${machine.steps - 1}.`);
  }
  const velocity = maybeNumber(edit, 'velocity');
  if (velocity === null) {
    refuse('invalid_input', `${where}: "velocity" is required — how hard the hit lands, 0..100, where 0 is a rest.`);
  }
  const after = clampHitVelocity(velocity);
  const bar = barFor(edit);
  // A pad the machine does not have yet is created first, so its row has a home —
  // the same bargain `pad.set` makes. `machineBarRows` is then the one place a
  // bar's rows are read, so bar 1 (the pads' own rows) and any other bar are
  // written the same way.
  const base = machine.pads.length >= index ? machine : withPad(machine, index, existing);
  const rows = machineBarRows(base, bar);
  const row = (rows[index - 1] ?? []).slice();
  record('pad.step', bar > 1 ? `pad ${index} bar ${bar} step ${step}` : `pad ${index} step ${step}`, row[step] ?? 0, after);
  row[step] = after;
  rows[index - 1] = row;
  song.machine = withMachineBar(base, bar, rows);
}

/**
 * The beat, back to rests — every pad, or one when "pad" is given.
 *
 * The whole-machine form is the counterpart of `pattern.clear`: one word to take
 * the machine back to silence, keeping the instrument. A clear of a single pad
 * keeps a machine's KICK while its busy hat row is redone.
 */
function applyMachineClear(song: Song, edit: ApiInput, _where: string, record: RecordChange): void {
  const machine = machineFor(song);
  const index = maybeNumber(edit, 'pad');
  const rawBar = maybeNumber(edit, 'bar');

  // A named bar clears that ONE bar, whole or one pad of it.
  if (rawBar !== null) {
    const bar = barFor(edit);
    const rows = machineBarRows(machine, bar);
    if (index === null) {
      const before = rows.reduce((n, row) => n + row.filter((v) => v > 0).length, 0);
      machine.pads.forEach((_pad, i) => { rows[i] = emptyRow(machine.steps); });
      song.machine = withMachineBar(machine, bar, rows);
      record('machine.clear', `bar ${bar}`, `${before} hits`, '0 hits');
      return;
    }
    const at = clampPadIndex(index);
    const row = rows[at - 1] ?? [];
    record('machine.clear', `pad ${at} bar ${bar}`, padPatternString(row, machine.steps), padPatternString(emptyRow(machine.steps), machine.steps));
    rows[at - 1] = emptyRow(machine.steps);
    song.machine = withMachineBar(machine, bar, rows);
    return;
  }

  if (index === null) {
    // No bar named is the whole BEAT: every bar, not just the first, because
    // "clear the machine" has to mean silence once a machine can hold several.
    const before = countMachineHits(machine);
    song.machine = {
      ...machine,
      pads: machine.pads.map((pad) => ({ ...pad, steps: emptyRow(machine.steps) })),
      bars: machine.bars.map(() => machine.pads.map(() => emptyRow(machine.steps))),
    };
    record('machine.clear', 'machine', `${before} hits`, `${countMachineHits(song.machine)} hits`);
    return;
  }
  const at = clampPadIndex(index);
  const pad = padAt(machine, at) ?? defaultPad(at, machine.steps);
  record('machine.clear', `pad ${at}`, padPatternString(pad.steps, machine.steps), padPatternString(emptyRow(machine.steps), machine.steps));
  song.machine = withPad(machine, at, { ...pad, steps: emptyRow(machine.steps) });
}

/**
 * Which machine BAR an edit names, 1-based, clamped to `1..MAX_MACHINE_BARS`.
 *
 * Absent means bar 1 — the pads' own rows — so every edit written before bars
 * existed keeps meaning exactly what it meant, and an edit may name a bar the
 * machine does not have yet the way a script may: the writer grows the bar list
 * with rests (`withMachineBar`) rather than refusing.
 */
function barFor(edit: ApiInput): number {
  const raw = maybeNumber(edit, 'bar');
  if (raw === null) return 1;
  return Math.max(1, Math.min(MAX_MACHINE_BARS, Math.round(raw)));
}

/**
 * One section of the song's FORM: a name, the bars it holds, and the machine bar
 * it plays.
 *
 * A section is defined by name rather than by position, so the same edit both
 * creates and REPLACES one — the last line about a name is the one that counts,
 * exactly as `section VERSE …` twice means "the verse is this now". `machine` is
 * the one field whose absence is meaningful: leave it off (or write `0`) and the
 * section plays whatever the machine's own `order` says, which is how a section
 * un-names a beat. That is the split `sample` already makes on a channel.
 */
function applySectionSet(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const name = maybeStr(edit, 'name');
  if (name === null) refuse('invalid_input', `${where}: "name" is required — the section to define, e.g. "VERSE".`);
  const problem = sectionNameProblem(name);
  if (problem !== null) refuse('invalid_input', `${where}: ${problem}`);
  const cleaned = tidySectionName(name);

  const raw = edit['bars'];
  if (!Array.isArray(raw) || raw.length === 0) {
    refuse('invalid_input', `${where}: "bars" is required — the pattern numbers this section plays, e.g. [1, 1, 2, 1].`);
  }
  const numbers: number[] = [];
  raw.forEach((entry) => {
    if (typeof entry === 'number' && Number.isFinite(entry)) numbers.push(entry);
    else if (typeof entry === 'string' && Number.isFinite(Number(entry))) numbers.push(Number(entry));
    else refuse('invalid_input', `${where}: "bars" must be a list of pattern numbers, e.g. [1, 1, 2, 1]; got ${JSON.stringify(entry)}.`);
  });
  const bars = clampSectionBars(numbers);
  if (bars.length === 0) refuse('invalid_input', `${where}: a section needs at least one bar.`);

  const machine = clampSectionMachineBar(maybeNumber(edit, 'machine'));
  const existing = sectionByName(song.sections, cleaned);
  if (!existing && song.sections.length >= MAX_SECTIONS) {
    refuse('invalid_input', `${where}: a song holds at most ${MAX_SECTIONS} sections.`);
  }
  song.sections = withSection(song.sections, { name: cleaned, bars, machineBar: machine });
  const was = existing ? existing.bars.join(' ') : '(none)';
  const now = `${bars.join(' ')}${machine === null ? '' : ` machine ${machine}`}`;
  record('section.set', `section ${cleaned}`, was, now);
}

/** Drop a section by name, so a form can be reshaped rather than only grown. */
function applySectionClear(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const name = maybeStr(edit, 'name');
  if (name === null) refuse('invalid_input', `${where}: "name" is required — the section to remove.`);
  const cleaned = tidySectionName(name);
  const existing = sectionByName(song.sections, cleaned);
  if (!existing) {
    refuse('not_found', `${where}: this song has no section "${cleaned}".`);
  }
  song.sections = withoutSection(song.sections, cleaned);
  // An arrangement that still names it would be a claim about a section that is
  // gone, so the name comes out of the form too — what a `section.clear` means.
  const arrangement = song.arrangement.filter((one) => one !== cleaned);
  if (arrangement.length !== song.arrangement.length) song.arrangement = arrangement;
  record('section.clear', `section ${cleaned}`, existing.bars.join(' '), '(none)');
}

/**
 * The ARRANGEMENT: the form written as a list of section names.
 *
 * It BUILDS the order, exactly as `arrange VERSE CHORUS` does in a script — so an
 * agent writes `VERSE VERSE CHORUS` and the song plays those bars. Every name must
 * already be defined (a name is a reference, not a definition), and an empty list
 * drops the claim without touching the order, which is how a caller says "this song
 * is arranges nothing now".
 */
function applyArrangeSet(song: Song, edit: ApiInput, where: string, record: RecordChange): void {
  const raw = edit['sections'];
  if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== 'string')) {
    refuse('invalid_input', `${where}: "sections" must be a list of section names, e.g. ["VERSE", "CHORUS", "VERSE"].`);
  }
  const names = (raw as string[]).map((one) => tidySectionName(one)).filter((one) => one !== '');
  const before = song.arrangement.join(' ');
  if (names.length === 0) {
    song.arrangement = [];
    record('arrange.set', 'arrangement', before, '(none)');
    return;
  }
  const { bars, missing } = arrangementBars(song.sections, names);
  if (missing !== null) {
    const have = song.sections.length === 0
      ? 'this song has none yet'
      : `this song has: ${song.sections.map((one) => one.name).join(', ')}`;
    refuse('invalid_input', `${where}: "${missing}" is not a section this song has — ${have}. Define it with section.set first.`);
  }
  if (bars.length > MAX_ORDER) {
    refuse('invalid_input', `${where}: that arrangement is ${bars.length} bars long, and a song plays at most ${MAX_ORDER}.`);
  }
  setOrder(song, bars);
  song.arrangement = names.slice();
  record('arrange.set', 'arrangement', before, names.join(' '));
}
