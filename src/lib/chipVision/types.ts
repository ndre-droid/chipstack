// Shared types for the photo → chip-count feature (AI vision).

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

export interface StackResult {
  id: string;                          // stable id, e.g. `${value}-${index}`
  value: number;
  count: number;
  confidence: number;
  crop: HTMLCanvasElement;             // cleaned crop for the editor (on-device only)
  span: [number, number];             // [yTop, yBottom] 0..1 of the crop, for end-caps
  flagged: boolean;
  // internal, on-device only — used to merge a second angle:
  box: [number, number, number, number];
  votes: number[];
  ratios: number[];
}

export interface CountResult {
  totals: DenomTotal[];          // grouped by denom, summed
  totalValue: number;
  anomalies: Anomaly[];
  frames: number;
  confidence: number;            // overall 0..1
  stacks: StackResult[];
}
