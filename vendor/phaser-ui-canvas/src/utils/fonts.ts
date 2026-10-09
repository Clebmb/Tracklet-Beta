/**
 * fonts — font readiness.
 *
 * A Phaser Text built before its @font-face finishes loading silently
 * rasterizes in a fallback face — the classic "the numbers changed font on
 * reload" bug. Anything that draws text at boot should await this first; it
 * resolves in the same tick in tests and on any host without the Font Loading
 * API, and it never hangs on a font that cannot load (file missing, storage
 * blocked): the UI is usable in the fallback face if it must be.
 */

/** Structural view of the FontFaceSet API, to avoid depending on lib.dom types. */
interface FontLoader {
  load(font: string): Promise<unknown>;
}

/**
 * `faces` are CSS font shorthand specs, e.g. `'8px Silkscreen'`. The default
 * is the set the framework's own text styles name; pass your own if you ship
 * different faces.
 */
export const DEFAULT_FACES = ['8px Silkscreen', '8px Alagard', '8px Unbalanced'] as const;

export function whenFontsReady(faces: readonly string[] = DEFAULT_FACES, timeoutMs = 2500): Promise<void> {
  const fonts = typeof document !== 'undefined'
    ? (document as unknown as { fonts?: FontLoader }).fonts
    : undefined;
  if (!fonts || typeof fonts.load !== 'function') return Promise.resolve();
  const ready = Promise
    .all(faces.map((f) => fonts.load(f).catch(() => undefined)))
    .then(() => undefined);
  const timeout = new Promise<void>((resolve) => { setTimeout(resolve, timeoutMs); });
  return Promise.race([ready, timeout]).catch(() => undefined);
}
