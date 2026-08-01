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

export interface CountResult {
  totals: DenomTotal[];          // grouped by denom, summed
  totalValue: number;
  anomalies: Anomaly[];
  frames: number;
  confidence: number;            // overall 0..1
}
