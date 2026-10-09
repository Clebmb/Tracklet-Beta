/**
 * ops/edit — `song.edit`: change ONE thing about a song you already have.
 *
 * Everything else in this API is all-or-nothing at the scale of a WHOLE song:
 * `script.apply` describes a song again, `song.create` starts one. That is the
 * right shape for writing music from nothing, and the wrong shape for the most
 * common thing an agent does second — a person looks at the song, says "the bass
 * is too loud" or "that note should be an F", and the answer should be one small
 * change rather than a regenerated song that quietly rewrites everything else.
 *
 * The vocabulary itself lives in `../edits`, so this operation and `library.update`
 * — which applies the same edits to a song already on disk — cannot drift apart.
 * What is left here is the two decisions that make it an OPERATION: where the song
 * comes from (the caller's `song`/`songJson`, or a blank one) and what a caller
 * gets back (the changed song, plus a line per edit saying what moved). The log is
 * the point: "I changed row 4" is a claim, and `C-4 -> D-4` is a fact the caller
 * can check without diffing two songs itself.
 *
 * `song.diff` is the same vocabulary read backwards. Give it two songs and it
 * returns the list that turns the first into the second, so an agent that has just
 * changed a draft can say what it did as edits rather than as prose — and a person
 * who has edited a song by hand can ask for the edits and hand them back.
 */

import { createSong, summarizeSong } from '../../../src/model';
import { field, schema, type ApiOperation } from '../operation';
import { refuse, ok } from '../result';
import { describeSong, songFromInput } from '../songAccess';
import { EDIT_OPS, applyEdits, editList } from '../edits';
import { diffSongs } from '../diff';

export const editOperations: ApiOperation[] = [
  {
    name: 'song.edit',
    title: 'Change one thing about a song',
    summary:
      'Apply a list of small edits — a cell, a channel, the tempo, the order — to a song you already have, and get the changed song back with a line per edit saying what moved.',
    category: 'song',
    example: {
      edits: [
        { op: 'song.set', bpm: 124 },
        { op: 'cell.set', pattern: 1, row: 0, track: 1, note: 'C-4', velocity: 110 },
        { op: 'track.set', track: 2, level: 70, pan: -20 },
      ],
    },
    input: schema(
      {
        song: field('object', 'The song to edit. Omit to edit a blank song.'),
        songJson: field('string', 'The same, as the text of a .json song file.'),
        edits: field(
          'array',
          `The changes, in order. Each is an object with an "op" of ${EDIT_OPS.join(
            ', ',
          )}; see api.describe for the fields each one takes.`,
        ),
      },
      ['edits'],
    ),
    run: (input) => {
      const song = songFromInput(input) ?? createSong();
      const changes = applyEdits(song, editList(input));
      return ok({
        song,
        edits: changes,
        changed: changes.filter((change) => change.changed).length,
        summary: summarizeSong(song),
        description: describeSong(song),
      });
    },
  },
  {
    name: 'song.diff',
    title: 'What changed between two songs',
    summary:
      'Compare two versions of a song and hand back the edits that turn the first into the second — the same list song.edit and library.update take — with a note for anything the vocabulary cannot express.',
    category: 'song',
    example: {},
    input: schema({
      before: field('object', 'The song you had.'),
      beforeJson: field('string', 'The same, as the text of a .json song file.'),
      after: field('object', 'The song you have now.'),
      afterJson: field('string', 'The same, as the text of a .json song file.'),
    }),
    run: (input) => {
      const before = songFromInput(input, 'before');
      const after = songFromInput(input, 'after');
      if (!before) refuse('invalid_input', 'give the older song as "before" or "beforeJson".');
      if (!after) refuse('invalid_input', 'give the newer song as "after" or "afterJson".');
      return ok(diffSongs(before, after));
    },
  },
];
