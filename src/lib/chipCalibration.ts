import { extractColumns, type Box } from './chipVision/extract.ts';
import { hexToLab } from './chipVision/color.ts';
import { DEFAULT_RATIO } from './chipVision/geometry.ts';
import type { Lab } from './chipVision/types.ts';

/**
 * From one calibration frame (a single stack of a known denom + known count),
 * learn that denom's edge colour and the measured thickness/diameter ratio.
 */
export async function calibrateDenom(
  frame: HTMLCanvasElement, box: Box, denomHex: string, knownCount: number,
): Promise<{ lab: Lab; ratio: number } | null> {
  // Use the denom's own hex as the only reference so the single column classifies to it.
  const refs = [{ value: 1, lab: hexToLab(denomHex) }];
  const { columns } = await extractColumns(frame, box, refs, DEFAULT_RATIO, 999);
  const col = columns[0];
  if (!col || col.bands.length === 0 || knownCount < 1) return null;
  // Band colour = learned edge colour; ratio back-solved from the observed column height.
  const band = col.bands.reduce((a, b) => (b.heightPx > a.heightPx ? b : a));
  const observedHpx = band.heightPx / knownCount;
  // hPx = ratio · major · sinθ  ⇒ ratio = observedHpx / (major·sinθ) = DEFAULT_RATIO · (observedHpx / col.hPx)
  const ratio = DEFAULT_RATIO * (observedHpx / (col.hPx || observedHpx));
  return { lab: band.lab, ratio: clamp(ratio, 0.05, 0.15) };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
