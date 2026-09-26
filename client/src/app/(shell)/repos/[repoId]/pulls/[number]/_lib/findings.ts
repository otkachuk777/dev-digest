import type { ReviewRecord, FindingRecord } from "@devdigest/shared";

/**
 * Every finding across all review runs, same order as `runs` (newest-run-first).
 * Shared by the page (findings count for the header) and FindingsTab (lethal
 * trifecta banner) so the flatMap logic isn't duplicated between the two.
 */
export function allFindings(runs: ReviewRecord[]): FindingRecord[] {
  return runs.flatMap((r) => r.findings);
}

/**
 * Smart Diff: each agent's latest `kind: "review"` findings, grouped by file.
 * Same "latest per agent" rule as the server's `findingsCountsByPr` — takes
 * only review (not summary) rows, keeps the first review seen per
 * `agent_id ?? id`, given `reviews` newest-first (as `usePrReviews` returns).
 */
export function latestFindingsPerAgent(reviews: ReviewRecord[]): Map<string, FindingRecord[]> {
  const seenGroups = new Set<string>();
  const byPath = new Map<string, FindingRecord[]>();

  for (const review of reviews) {
    if (review.kind !== "review") continue;
    const groupKey = review.agent_id ?? review.id;
    if (seenGroups.has(groupKey)) continue;
    seenGroups.add(groupKey);

    for (const finding of review.findings) {
      const list = byPath.get(finding.file) ?? [];
      list.push(finding);
      byPath.set(finding.file, list);
    }
  }

  return byPath;
}
