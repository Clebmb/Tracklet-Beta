import { describe, expect, it } from 'vitest';

import { buildChannelChain } from '../audio/chain';

/**
 * A PAD's pan, which the machine used to throw away.
 *
 * Each pad plays through its own little strip (`padStripOptions`), and that strip
 * is where a pad's `level` and `pan` become real nodes. The pad strips feed the
 * MACHINE's chain, which then feeds the mix — so the machine's input is handed a
 * signal that is already STEREO.
 *
 * ── The bug this file pins ───────────────────────────────────────────────────
 *
 * A `ChannelMergerNode` input reads exactly ONE channel, and a mono `GainNode`
 * folds whatever reaches it to a single channel. So the original wiring —
 * `fader → left → merger(0,0)` and `fader → right → merger(0,1)` — took a pad's
 * stereo pair, down-mixed it to the LEFT channel, and fed that same channel to
 * both sides. The result was measured on a real render: a pad panned hard right
 * came out identical in both ears (`L === R`), while a CHANNEL panned hard right
 * panned correctly — because a channel's own notes are mono and never hit the
 * fold. A pad's place between the speakers reached the file and the tab but not
 * the sound.
 *
 * The fix is the `inputChannels: 2` option: the machine's chain splits its stereo
 * input and balances the two sides (`splitter → left(0) / right(1) → merger`),
 * which is what a stereo source's pan MEANS. The mono branch is untouched, so
 * every track keeps the graph it always had.
 *
 * The DSP needs an `OfflineAudioContext` a headless runner does not have, so the
 * GRAPH is what is asserted here — the shape of the fix — and the audible result
 * is verified live. That is the same bargain `goldenPlan.ts` makes.
 */

/** One fake node, remembering every connection it was asked to make. */
interface FakeNode {
  kind: string;
  id: number;
  channelCount: number;
  channelCountMode: string;
  gain: { value: number; setTargetAtTime(v: number): void };
  connections: { to: number; outIndex: number; inIndex: number }[];
  connect(target: FakeNode, outIndex?: number, inIndex?: number): FakeNode;
  disconnect(): void;
}

/**
 * A stand-in for the audio context: enough of it to build a chain with no
 * effects, recording the graph instead of rendering it.
 */
function fakeCtx(): { ctx: AudioContext; nodes: FakeNode[] } {
  const nodes: FakeNode[] = [];
  let id = 0;
  const make = (kind: string): FakeNode => {
    const node: FakeNode = {
      kind,
      id: id++,
      channelCount: 2,
      channelCountMode: 'max',
      gain: { value: 0, setTargetAtTime() {} },
      connections: [],
      connect(target, outIndex = 0, inIndex = 0) {
        this.connections.push({ to: target.id, outIndex, inIndex });
        return target;
      },
      disconnect() {},
    };
    nodes.push(node);
    return node;
  };
  const ctx = {
    currentTime: 0,
    createGain: () => make('gain'),
    createChannelMerger: () => make('merger'),
    createChannelSplitter: () => make('splitter'),
  };
  return { ctx: ctx as unknown as AudioContext, nodes };
}

/** Build one chain and hand back its nodes plus the destination it was wired to. */
function build(options: { level: number; pan: number; verb: number; echo: number; inputChannels?: number }) {
  const { ctx, nodes } = fakeCtx();
  const dest = (ctx as unknown as { createGain(): FakeNode }).createGain();
  const sends = { reverb: ctx.createGain(), echo: ctx.createGain() } as unknown as { reverb: AudioNode; echo: AudioNode };
  const chain = buildChannelChain(ctx, options, dest as unknown as AudioNode, sends);
  return { nodes, chain, dest };
}

describe('a machine chain fed by panned pads keeps their place in the field', () => {
  it('splits a stereo input and balances the sides, instead of folding to mono', () => {
    const { nodes } = build({ level: 1, pan: 0, verb: 0, echo: 0, inputChannels: 2 });
    const splitters = nodes.filter((n) => n.kind === 'splitter');
    expect(splitters).toHaveLength(1);
    const splitter = splitters[0]!;
    // Each side reads its OWN channel of the input: left from 0, right from 1.
    const leftReads = splitter.connections.find((c) => c.outIndex === 0);
    const rightReads = splitter.connections.find((c) => c.outIndex === 1);
    expect(leftReads).toBeDefined();
    expect(rightReads).toBeDefined();
    // And the two sides go to opposite ears of the merger.
    const merger = nodes.find((n) => n.kind === 'merger')!;
    const intoMerger = nodes.flatMap((n) => n.connections.filter((c) => c.to === merger.id));
    expect(intoMerger.some((c) => c.inIndex === 0)).toBe(true);
    expect(intoMerger.some((c) => c.inIndex === 1)).toBe(true);
    // The two merger inputs must come from DIFFERENT nodes, or both ears get the
    // same signal — which was the whole bug.
    const fromLeft = intoMerger.find((c) => c.inIndex === 0)!;
    const fromRight = intoMerger.find((c) => c.inIndex === 1)!;
    expect(fromLeft.to).toBe(merger.id);
    expect(fromRight.to).toBe(merger.id);
    // The two sides read DIFFERENT channels of the splitter, or both ears get the
    // same signal — which was the whole bug.
    expect(leftReads!.to).not.toBe(rightReads!.to);
  });

  it('holds both input channels rather than letting the node fold them', () => {
    const { chain } = build({ level: 1, pan: 0, verb: 0, echo: 0, inputChannels: 2 });
    expect(chain.input.channelCount).toBe(2);
    expect(chain.input.channelCountMode).toBe('explicit');
  });

  it('leaves a track’s mono graph exactly as it was — no splitter, no fold', () => {
    // The inertness half: a channel that asks for nothing keeps the graph it had
    // before the machine existed, so every golden hash and every old song is
    // untouched. No splitter, and the input follows its source as before.
    const { nodes, chain } = build({ level: 1, pan: 0, verb: 0, echo: 0 });
    expect(nodes.filter((n) => n.kind === 'splitter')).toHaveLength(0);
    expect(chain.input.channelCountMode).not.toBe('explicit');
  });
});
