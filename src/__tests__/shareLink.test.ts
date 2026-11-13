import { describe, expect, it } from 'vitest';

import { applyScript } from '../model/script';
import { MAX_SHARE_URL, shareLink, shareSongFromUrl } from '../model/shareLink';
import { createSong, MAX_ROWS } from '../model/song';

function play(source: string) {
  const result = applyScript(createSong(), source);
  if (!result.ok) throw new Error(`${source} should parse: ${JSON.stringify(result.errors)}`);
  return result.song;
}

const BASE = 'https://example.com/tracklet/';

describe('a link that carries the song', () => {
  it('round-trips a song through the fragment and back', () => {
    const song = play('song "SHARED"\ntracks 4\nsteps 16\nnote 0 1 C-4\nnote 4 2 E-4');
    const made = shareLink(song, BASE);
    if (!made.ok) throw new Error(made.reason);
    expect(made.url.startsWith(`${BASE}#s=`)).toBe(true);
    const read = shareSongFromUrl(made.url);
    if (!read.ok) throw new Error(read.reason);
    const back = play(read.script);
    expect(back.title).toBe('SHARED');
    expect(back.patterns[0]?.steps[0]?.[0]?.note).toBe(60);
    expect(back.patterns[0]?.steps[4]?.[1]?.note).toBe(64);
  });

  it('keeps the page it was given and drops a query or fragment it already had', () => {
    const song = play('song "X"');
    const made = shareLink(song, 'https://example.com/app/?tab=2#old');
    if (!made.ok) throw new Error(made.reason);
    // One fragment, and it is the song's: a URL cannot hold two.
    expect(made.url).toBe(`https://example.com/app/#s=${made.url.split('#s=')[1]}`);
    expect(made.url.split('#')).toHaveLength(2);
  });

  it('refuses a song too big for a link, naming the way out', () => {
    // A full-length grid with something on every step of every channel is exactly
    // the song a link cannot hold: the script alone is thousands of lines.
    const big = play(`tracks 16\nsteps ${MAX_ROWS}`);
    for (const row of big.patterns[0]?.steps ?? []) for (const cell of row) cell.note = 60;
    const made = shareLink(big, BASE);
    expect(made.ok).toBe(false);
    if (made.ok) return;
    expect(made.reason).toContain(String(MAX_SHARE_URL));
    expect(made.reason).toContain('pack save');
  });

  it('refuses a link with no song in it, and one cut short', () => {
    expect(shareSongFromUrl('https://example.com/').ok).toBe(false);
    const empty = shareSongFromUrl('https://example.com/#s=');
    expect(empty.ok).toBe(false);
    const cut = shareSongFromUrl('https://example.com/#s=not!base64');
    expect(cut.ok).toBe(false);
    if (cut.ok) return;
    expect(cut.reason).toContain('cut short');
  });

  it('reads a bare fragment too, so a pasted `#s=…` is enough', () => {
    const song = play('song "BARE"');
    const made = shareLink(song, BASE);
    if (!made.ok) throw new Error(made.reason);
    const fragment = made.url.slice(made.url.indexOf('#s='));
    const read = shareSongFromUrl(fragment);
    if (!read.ok) throw new Error(read.reason);
    expect(play(read.script).title).toBe('BARE');
  });
});
