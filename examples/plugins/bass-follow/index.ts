/**
 * bass-follow — the second proof that a plugin can write music.
 *
 * A bassline that hangs on the song's chord loop: one root per chord start,
 * shaped by a named rhythm (`four`, `half`, `offbeat`). PURE data like its
 * sibling (`../euclid-drums/index.ts`) — the loop and the rhythm in, the notes
 * out — sharing the one function in `src/plugins/generator.ts` with the
 * script word and the API op, so the three can never disagree.
 */

export type BassRhythm = 'four' | 'half' | 'offbeat';

export interface BassStep {
  kind: 'name' | 'degree';
  root?: number;
  quality?: string;
  degree?: number;
  intervals?: number[];
}

export interface BassInput {
  roots: number[];
  hold: number;
  rows: number;
  from?: number;
  rhythm?: BassRhythm;
}

/** One root per kept chord start: the row it lands on and the MIDI it plays. */
export function expand(input: BassInput): { row: number; midi: number }[] {
  const rows = Math.max(0, Math.round(input.rows));
  if (rows === 0 || input.roots.length === 0) return [];
  const hold = Math.max(1, Math.round(input.hold));
  const from = Math.max(0, Math.round(input.from ?? 0));
  const rhythm = input.rhythm ?? 'four';
  const starts: number[] = [];
  for (let row = from; row < rows; row += hold) starts.push(row);
  const kept =
    rhythm === 'half'
      ? starts.filter((_row, index) => index % 2 === 0)
      : rhythm === 'offbeat'
        ? starts.map((row) => row + Math.max(1, Math.floor(hold / 2))).filter((row) => row < rows)
        : starts;
  return kept.map((row) => ({
    row,
    midi: input.roots[Math.floor(row / hold) % input.roots.length] ?? input.roots[0]!,
  }));
}
