import type { BlastRadius } from "@devdigest/shared";

/** UI-local derivation of the stats row — never stored, computed at render. */
export function blastStats(blast: BlastRadius): {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
} {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const d of blast.downstream) {
    callers += d.callers.length;
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  return {
    symbols: blast.changed_symbols.length,
    callers,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}
