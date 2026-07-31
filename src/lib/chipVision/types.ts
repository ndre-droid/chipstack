// Shared computer-vision types for the photo → chip-count feature.

export type Lab = [number, number, number];

/** A denomination's reference edge colour, in CIE Lab. */
export interface DenomRef {
  value: number;
  lab: Lab;
}

/** Per-device calibration learned by the calibration wizard. NOT synced. */
export interface ChipCalibration {
  ratio: number;                 // measured chip thickness / diameter
  colors: Record<number, Lab>;   // denom value → learned edge colour (Lab)
  createdAt: number;             // epoch ms
}

/** A fitted top-face ellipse for a column (pixels). */
export interface Ellipse {
  cx: number;
  cy: number;
  major: number;                 // full major axis length (≈ diameter px)
  minor: number;                 // full minor axis length
  angleDeg: number;
}

/** One detected colour band inside a column. */
export interface Band {
  denomValue: number | null;     // null = unknown, user must assign
  lab: Lab;
  heightPx: number;
  count: number;                 // rounded chip count (≥ 1)
  confidence: number;            // 0..1
  colorMargin: number;           // ΔE to 2nd-best denom minus best
  roundness: number;             // 0..1, how integer the raw count was
}

/** One column's read result. */
export interface ColumnResult {
  x0: number;
  x1: number;
  topY: number;
  bottomY: number;
  hPx: number;                   // single-chip edge height (px)
  bands: Band[];
}

export type AnomalySeverity = 'warn' | 'blocking';

export interface Anomaly {
  code: string;                  // i18n key suffix, e.g. 'mergedColumns'
  severity: AnomalySeverity;
  autoFixed: boolean;
  columnIndex?: number;
}

export interface DenomTotal {
  value: number;
  count: number;
  confidence: number;
}

export interface CountResult {
  totals: DenomTotal[];          // grouped by denom, summed across all columns
  totalValue: number;
  anomalies: Anomaly[];
  frames: number;
  confidence: number;            // overall 0..1
}
