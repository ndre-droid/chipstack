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
  confidence: number;                  // self-consistency across samples (agreement), 0..1
  crop: HTMLCanvasElement;             // cleaned crop for the manual seam editor
  span: [number, number];             // [yTop, yBottom] 0..1 of the crop, for end-caps
  flagged: boolean;                    // soft hint: the samples disagreed — worth a glance
}

export interface CountResult {
  totals: DenomTotal[];          // grouped by denom, summed
  totalValue: number;
  anomalies: Anomaly[];
  frames: number;
  confidence: number;            // overall 0..1
  stacks: StackResult[];
}
