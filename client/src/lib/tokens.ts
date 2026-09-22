/** Rough token estimate (chars / 4) — the same approximation the design uses. */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}
