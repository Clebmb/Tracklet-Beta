/**
 * texture — the one procedural texture the UI generates.
 *
 * The panels are near-black, and a flat near-black field looks like a hole.
 * A 64x64 speckle of dark navy/charcoal with rare brighter flecks gives the
 * backdrop a stone grain. It is generated once and cached by key, so it is
 * safe to call on every open.
 */

import type Phaser from 'phaser';

/** The default texture key. Pass your own if you draw more than one. */
export const NOISE_TEXTURE_KEY = 'ui-stone-noise';

/**
 * Create (or reuse) the noise texture and return its key. Idempotent. Returns
 * the key even when a Canvas texture cannot be made (a Canvas-renderer-less
 * host), so callers can use it blindly.
 */
export function ensureNoiseTexture(
  scene: Phaser.Scene,
  key: string = NOISE_TEXTURE_KEY,
  size = 64,
): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return key;
  const ctx = tex.getContext();
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    // Dark navy/charcoal speckle with rare stone-fleck brightness.
    const r = Math.random();
    const v = r < 0.82 ? 10 + Math.random() * 8 : 24 + Math.random() * 18;
    img.data[i] = v;
    img.data[i + 1] = v + 2;
    img.data[i + 2] = v + 8;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return key;
}
