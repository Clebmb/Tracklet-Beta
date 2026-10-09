/**
 * download — put bytes on the user's disk.
 *
 * The one piece of DOM a canvas app needs to hand a file over. It lives here
 * rather than in the file menu because TWO screens now write files — the file
 * menu's EXPORT page and the RECORDER page's OUT half — and an export must behave
 * the same wherever it is run from: the same name, the same bytes, the same
 * browser download. One function is how that stays true.
 *
 * The anchor is invisible and clicked programmatically, so the file NAME is the
 * only thing an assistive tool could read out of it — say what it is.
 */
export function downloadBytes(name: string, mime: string, body: BlobPart | Uint8Array): void {
  // A `Uint8Array` IS a `BlobPart` at runtime; the cast is only for a TypeScript
  // library that now tells an `ArrayBuffer` apart from a shared one, which a
  // song's bytes never are.
  const url = URL.createObjectURL(new Blob([body as BlobPart], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.setAttribute('aria-label', `Save ${name}`);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The blob stays alive for the life of the tab unless it is released; the
  // download has begun, so one turn of the event loop is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
