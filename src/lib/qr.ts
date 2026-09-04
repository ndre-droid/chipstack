import { useEffect, useState } from 'react';

/**
 * A QR code as a data URL, with the generator fetched only when one is drawn.
 *
 * `qrcode-generator` is 52kB of source and every launch of the app was paying for
 * it. What it actually serves is three screens nobody opens on a normal night: the
 * share sheet, the "show this on your TV" link, and the big screen's own pairing
 * card. So it is dynamically imported, and the module is fetched once and reused.
 *
 * Asynchronous is not a compromise here. All three call sites already rendered
 * nothing while the code was null (a QR is a `try`/`catch` away from being
 * unavailable), so "not yet" and "not possible" take the same path they always did.
 */
/* The package declares its factory as the module's default export AND hangs a few
   helpers off the namespace, so `typeof import(...)` is not the factory type. Name
   the namespace, and take `.default` off it. */
type QrNamespace = Awaited<ReturnType<typeof importQr>>;
const importQr = () => import('qrcode-generator');

let pending: Promise<QrNamespace> | null = null;

/** The generator, fetched once and reused. */
function loadQr(): Promise<QrNamespace> {
  return (pending ??= importQr());
}

export interface QrOptions {
  /** pixels per module. Bigger is not sharper on a phone — it is sharper on a wall. */
  cell?: number;
  /** quiet zone, in pixels */
  margin?: number;
  /** error correction. 'L' for a long payload, 'M' for a URL somebody points a camera at. */
  level?: 'L' | 'M' | 'Q' | 'H';
}

/** Encode `text`, or null when it cannot be encoded (too long for the level, no module). */
export async function qrDataUrl(text: string, opts: QrOptions = {}): Promise<string | null> {
  if (!text) return null;
  try {
    const { default: qrcode } = await loadQr();
    const qr = qrcode(0, opts.level ?? 'M');
    qr.addData(text);
    qr.make();
    return qr.createDataURL(opts.cell ?? 6, opts.margin ?? 12);
  } catch {
    return null;
  }
}

/**
 * The same thing as a hook, so a call site stays one line.
 *
 * The options are spread into the dependency list rather than compared by
 * identity: an object literal in a render is a new object every time, and this
 * would otherwise re-encode the same code on every keystroke elsewhere on the page.
 */
export function useQrDataUrl(text: string | null | undefined, opts: QrOptions = {}): string | null {
  const { cell, margin, level } = opts;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!text) {
      setUrl(null);
      return;
    }
    let alive = true;
    void qrDataUrl(text, { cell, margin, level }).then((next) => {
      if (alive) setUrl(next);
    });
    return () => {
      alive = false;
    };
  }, [text, cell, margin, level]);

  return url;
}
