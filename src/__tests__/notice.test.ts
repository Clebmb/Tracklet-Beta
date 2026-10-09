/**
 * The "noticed something" channel's arithmetic.
 *
 * Two things are worth a guard here, and neither is the observations themselves —
 * those are `advisoriesFor`'s, tested where they are written. What this file holds
 * is the CHANNEL: that a notice is said once and not once per keystroke, and that
 * the form it is said in fits the place it is said.
 *
 * The failure this exists to prevent is the one that makes an advisory system
 * worthless rather than broken: a channel that repeats itself. `noticesAdded` is
 * the whole defence, and it is three lines, so the only honest way to keep it is
 * to pin it.
 */
import { describe, expect, it } from 'vitest';
import { createSong } from '../model/song';
import { applyScript } from '../model/script';
import { noticeAt, noticeHeadline, noticePosition, noticeTag, noticeToast, noticesAdded, noticesFor } from '../model/notice';

describe('the notice channel', () => {
  it('notices a song whose parts are not written yet', () => {
    const notices = noticesFor(createSong());
    expect(notices.length).toBeGreaterThan(0);
    expect(notices.some((n) => n.text.includes('no notes'))).toBe(true);
  });

  it('has nothing to say about a song that is written', () => {
    // One channel, one pattern, one note, no form: the smallest song that is
    // complete rather than unfinished — every observation in the model is about
    // a part that is silent, a stack that is loud, or a form that is half-made.
    // One note on every channel of the default four, so no channel is silent and
    // the pattern is not empty: there is nothing left to notice.
    const written = applyScript(createSong(), 'note 0 1 C-4\nnote 0 2 E-4\nnote 0 3 G-4\nnote 0 4 C-5');
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(noticesFor(written.song)).toEqual([]);
  });

  it('says a notice once, and says it again only when it comes back', () => {
    const one = [{ text: 'pattern 2 is empty.' }];
    const both = [...one, { text: 'track 1 "LEAD" has no notes.' }];
    const seen: string[] = [];

    // First look: everything is new.
    expect(noticesAdded(seen, one)).toEqual(one);
    seen.push(...noticesAdded(seen, one).map((notice) => notice.text));

    // Second look at the same song: silence. This is the rule that keeps the
    // channel from becoming a thing people learn to ignore.
    expect(noticesAdded(seen, one)).toEqual([]);

    // A NEW observation speaks; the old one does not.
    expect(noticesAdded(seen, both)).toEqual([both[1]]);
    seen.push(...noticesAdded(seen, both).map((notice) => notice.text));

    // And one that is fixed and comes back is a change again.
    expect(noticesAdded(seen, one)).toEqual([]);
    seen.length = 0;
    expect(noticesAdded(seen, one)).toEqual(one);
  });

  it('never repeats itself for a notice that is still true', () => {
    const song = createSong();
    const seen: string[] = [];
    const first = noticesAdded(seen, noticesFor(song));
    seen.push(...first.map((notice) => notice.text));
    // Ten more looks at an unchanged song: nothing new, and no notice lost.
    for (let i = 0; i < 10; i++) {
      expect(noticesAdded(seen, noticesFor(song))).toEqual([]);
    }
    expect(seen).toEqual(noticesFor(song).map((notice) => notice.text));
  });

  it('cuts a notice to its observation, not half of its example', () => {
    const notice = 'track 2 "LEAD" stacks 3 layers all at full gain, so it is much louder than one - turn one down, e.g. "layer 2 3 gain 40".';
    const headline = noticeHeadline(notice);
    expect(headline).toBe('track 2 "LEAD" stacks 3 layers all at full gain, so it is much louder than one');
    expect(headline).not.toContain('e.g.');
    // A notice with no example is returned whole.
    expect(noticeHeadline('pattern 3 is empty.')).toBe('pattern 3 is empty.');
  });

  it('says the long form when there is room and the headline when there is not', () => {
    const notice = 'pattern 3 is empty - one "repeat" would fill it.';
    expect(noticeToast(notice, 100)).toBe(notice);
    expect(noticeToast(notice, 20)).toBe('pattern 3 is empty');
  });

  it('keeps a tag inside the width it was given', () => {
    const notice = 'the song defines sections but its order is not an arrangement of them - one "arrange ..." line writes the form.';
    for (const width of [10, 18, 24, 40]) {
      expect(noticeTag(notice, width).length).toBeLessThanOrEqual(width);
    }
    expect(noticeTag(notice, 24).endsWith('\u2026')).toBe(true);
    // A notice short enough is not cut at all.
    expect(noticeTag('pattern 3 is empty.', 24)).toBe('pattern 3 is empty.');
  });

  it('walks a list of notices without ever pointing past its end', () => {
    const list = ['a.', 'b.', 'c.'];
    expect(noticeAt(list, 0)).toBe('a.');
    expect(noticeAt(list, 3)).toBe('a.');
    expect(noticeAt(list, 7)).toBe('b.');
    expect(noticeAt(list, -1)).toBe('c.');
    expect(noticeAt([], 4)).toBeUndefined();

    expect(noticePosition(0, 3)).toBe('1 / 3');
    expect(noticePosition(4, 3)).toBe('2 / 3');
    expect(noticePosition(-1, 3)).toBe('3 / 3');
    expect(noticePosition(2, 0)).toBe('');
  });
});
