import type { BlastResult } from '../repo-intel/index.js';
import type { BlastRadius, DownstreamImpact, PrHistoryItem, MergedPullRef } from '@devdigest/shared';

/**
 * Pure row → DTO mapping. No I/O, no container: `BlastResult` (repo-intel's
 * facade shape) in, the wire `BlastRadius` contract out.
 */

/**
 * Group a flat, rank-sorted `result.callers` list by `viaSymbol`, attribute
 * endpoints/crons from `result.factsByFile`, and sort groups by relevance.
 */
export function toBlastRadius(result: BlastResult): BlastRadius {
  const order: string[] = [];
  const groups = new Map<
    string,
    { callers: { name: string; file: string; line: number; rank: number }[] }
  >();

  for (const c of result.callers) {
    let group = groups.get(c.viaSymbol);
    if (!group) {
      group = { callers: [] };
      groups.set(c.viaSymbol, group);
      order.push(c.viaSymbol);
    }
    group.callers.push({ name: c.symbol, file: c.file, line: c.line, rank: c.rank });
  }

  const downstream: DownstreamImpact[] = order.map((symbol) => {
    const group = groups.get(symbol)!;
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const caller of group.callers) {
      const facts = result.factsByFile?.[caller.file];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const c of facts.crons) crons.add(c);
    }
    return {
      symbol,
      callers: group.callers.map(({ name, file, line }) => ({ name, file, line })),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
    };
  });

  const maxRank = (symbol: string) =>
    Math.max(0, ...groups.get(symbol)!.callers.map((c) => c.rank));
  downstream.sort((a, b) => {
    const rankDiff = maxRank(b.symbol) - maxRank(a.symbol);
    if (rankDiff !== 0) return rankDiff;
    return b.callers.length - a.callers.length;
  });

  const totalCallers = downstream.reduce((n, d) => n + d.callers.length, 0);
  const uniqueEndpoints = new Set(downstream.flatMap((d) => d.endpoints_affected));
  const uniqueCrons = new Set(downstream.flatMap((d) => d.crons_affected));

  return {
    changed_symbols: result.changedSymbols.map(({ name, file, kind }) => ({ name, file, kind })),
    downstream,
    summary: buildSummary(
      result.changedSymbols.length,
      totalCallers,
      uniqueEndpoints.size,
      uniqueCrons.size,
    ),
    ...(result.degraded !== undefined ? { degraded: result.degraded } : {}),
    ...(result.reason !== undefined ? { reason: result.reason } : {}),
  };
}

/** Build the one-line summary from counts only — no I/O. */
export function buildSummary(
  symbols: number,
  callers: number,
  endpoints: number,
  crons: number,
): string {
  const parts = [`${symbols} symbols changed`];
  parts.push(callers > 0 ? `${callers} callers` : 'no downstream callers');
  if (callers > 0) {
    if (endpoints > 0) parts.push(`${endpoints} endpoint${endpoints === 1 ? '' : 's'}`);
    if (crons > 0) parts.push(`${crons} cron${crons === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

/**
 * Dedupe merged PRs collected per changed file into the `PrHistory` list:
 * exclude the current PR, collect which files each PR overlaps, sort by
 * `merged_at` desc, and cap to `max`.
 */
export function mergePriorPrs(
  files: string[],
  perFile: MergedPullRef[][],
  currentNumber: number,
  max: number,
): PrHistoryItem[] {
  const byNumber = new Map<number, { pr: MergedPullRef; files: Set<string> }>();

  perFile.forEach((prs, i) => {
    const file = files[i];
    if (file === undefined) return;
    for (const pr of prs) {
      if (pr.number === currentNumber) continue;
      let entry = byNumber.get(pr.number);
      if (!entry) {
        entry = { pr, files: new Set() };
        byNumber.set(pr.number, entry);
      }
      entry.files.add(file);
    }
  });

  return [...byNumber.values()]
    .sort((a, b) => (a.pr.merged_at < b.pr.merged_at ? 1 : a.pr.merged_at > b.pr.merged_at ? -1 : 0))
    .slice(0, max)
    .map(({ pr, files: overlap }) => ({
      pr_number: pr.number,
      title: pr.title,
      merged_at: pr.merged_at,
      author: pr.author,
      files_overlap: [...overlap],
      notes: '',
    }));
}
