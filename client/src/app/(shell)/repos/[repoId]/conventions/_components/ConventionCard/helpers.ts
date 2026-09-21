/** Confidence at or above this reads as solid (green); below it as "check me" (amber). */
export const CONFIDENCE_OK = 0.85;

export function confidenceColor(confidence: number): string {
  return confidence >= CONFIDENCE_OK ? "var(--ok)" : "var(--warn)";
}

export function confidencePercent(confidence: number): number {
  return Math.round(confidence * 100);
}

/** `src/api/users.ts:23-31`, or `:23` when the evidence is a single line. */
export function formatEvidenceRange(path: string, start: number, end: number): string {
  return end > start ? `${path}:${start}-${end}` : `${path}:${start}`;
}
