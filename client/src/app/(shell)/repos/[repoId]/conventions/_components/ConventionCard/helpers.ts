/** Confidence at or above this reads as solid (green); below it as "check me" (amber). */
export const CONFIDENCE_OK = 0.85;

export function confidenceColor(confidence: number): string {
  return confidence >= CONFIDENCE_OK ? "var(--ok)" : "var(--warn)";
}

export function confidencePercent(confidence: number): number {
  return Math.round(confidence * 100);
}
