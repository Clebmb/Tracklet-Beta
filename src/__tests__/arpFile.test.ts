/**
 * The ARP page's DIALS as SONG DATA — the model field and the two file formats.
 *
 * The promise this phase makes is narrow and checkable: **a song with no arp is
 * the song it always was.** No dials means no `arp` key, no new file version and
 * no extra script line, so every song written before the page round-trips byte
 * for byte. A song that does store dials writes them, declares the version an
 * older build would need to refuse rather than silently drop, and comes back
 * through both formats with the five settings intact.
 *
 * The ROUND TRIP is checked in JSON here. The script's `arp …` grammar is the
 * next phase's, so this suite writes the lines and reads the JSON back; it does
 * not yet paste the script.
 */

import { describe, expect, it } from 'vitest';

import {
  ARP_SONG_FILE_VERSION,
  MAX_ARP_OCTAVES,
  SCENES_SONG_FILE_VERSION,
  SONG_FILE_VERSION,
  SONG_FILE_VERSION_MAX,
  arpScript,
  createSong,
  songFromJson,
  songToJson,
  songToScript,
  type ArpSettings,
} from '../model';

/** The dials a page leaves when somebody has nudged every one of them. */
const DIALED: ArpSettings = { direction: 'updown', octaves: 3, rate: 2, gate: 60, mode: 'source' };

/** A song carrying a set of dials. */
function dialed(settings: ArpSettings = DIALED) {
  const song = createSong();
  song.arp = settings;
  return song;
}

describe('the arp settings on the song', () => {
  it('starts absent, which is what every song before the page means', () => {
    expect(createSong().arp).toBeNull();
  });

  it('writes no key and no new version when there are none', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    expect(raw.version).toBe(SONG_FILE_VERSION);
    expect(JSON.stringify(raw)).not.toContain('"arp"');
    // And no line in the script either, so the saved text is exactly what this
    // app wrote before the page existed.
    expect(songToScript(createSong())).not.toContain('arp ');
  });

  it('writes the key and claims the newest version when there are', () => {
    const raw = JSON.parse(songToJson(dialed())) as Record<string, unknown>;
    expect(raw.version).toBe(ARP_SONG_FILE_VERSION);
    // The arp version is the ceiling, one above the live set's scenes, and the
    // model field sits at the end of the shelf beside the machine.
    expect(ARP_SONG_FILE_VERSION).toBe(SONG_FILE_VERSION_MAX);
    expect(SCENES_SONG_FILE_VERSION).toBe(ARP_SONG_FILE_VERSION - 1);
    expect(raw.arp).toEqual({
      direction: 'updown',
      octaves: 3,
      rate: 2,
      gate: 60,
      mode: 'source',
    });
  });

  it('round trips the five dials through JSON', () => {
    const parsed = songFromJson(songToJson(dialed()));
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.arp).toEqual(DIALED);
  });

  it('writes the dials into the script, as the lines that set them back', () => {
    const script = songToScript(dialed());
    for (const line of arpScript(DIALED)) expect(script).toContain(line);
  });

  it('defaults a dial a file leaves out rather than refusing the whole file', () => {
    // Every setting is optional, so a file that names only a direction reads as
    // the other four defaults — the same bargain `swing` and `groove` make.
    const song = dialed();
    const raw = JSON.parse(songToJson(song)) as Record<string, unknown>;
    raw.arp = { direction: 'down' };
    const parsed = songFromJson(JSON.stringify(raw));
    if (!parsed.ok) throw new Error(parsed.errors.join(' / '));
    expect(parsed.song.arp).toEqual({ direction: 'down', octaves: 2, rate: 1, gate: 100, mode: 'chord' });
  });
});

describe('reading the arp settings from a file', () => {
  it('refuses a direction this build does not have, by name', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const bad = songFromJson(JSON.stringify({ ...raw, arp: { direction: 'sideways' } }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors.join(' ')).toContain('sideways');
    expect(bad.errors.join(' ')).toContain('not an arp direction');
  });

  it('refuses a mode this build does not have, by name', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const bad = songFromJson(JSON.stringify({ ...raw, arp: { mode: 'arpeggio' } }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors.join(' ')).toContain('mode');
    expect(bad.errors.join(' ')).toContain('arpeggio');
  });

  it('refuses a value that is not an object at all', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const bad = songFromJson(JSON.stringify({ ...raw, arp: 'up down' }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors.join(' ')).toContain('"arp" must be an object');
  });

  it('clamps the three numbers rather than refusing an out-of-range taste', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const wide = songFromJson(JSON.stringify({
      ...raw,
      arp: { direction: 'up', octaves: 99, rate: 0, gate: 250, mode: 'chord' },
    }));
    if (!wide.ok) throw new Error(wide.errors.join(' / '));
    expect(wide.song.arp).toEqual({ direction: 'up', octaves: MAX_ARP_OCTAVES, rate: 1, gate: 100, mode: 'chord' });
  });

  it('refuses a number where a number is not', () => {
    const raw = JSON.parse(songToJson(createSong())) as Record<string, unknown>;
    const bad = songFromJson(JSON.stringify({ ...raw, arp: { octaves: 'two' } }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors.join(' ')).toContain('octaves');
  });
});
