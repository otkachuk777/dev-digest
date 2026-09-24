import type { SmartDiff } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { ROLE_ORDER } from './constants.js';

/**
 * Same rule as pulls/findings-counts.ts: rows arrive newest-review-first,
 * and the first row seen per `agentId ?? reviewId` group wins — a stale
 * review from an already-seen agent (or null-agentId group) is dropped.
 */
export function latestPerAgent<T extends { agentId: string | null; reviewId: string }>(
  rows: T[],
): T[] {
  const latestReviewByGroup = new Map<string, string>();
  const out: T[] = [];

  for (const row of rows) {
    const groupKey = row.agentId ?? row.reviewId;
    const latestReviewId = latestReviewByGroup.get(groupKey);
    if (latestReviewId === undefined) {
      latestReviewByGroup.set(groupKey, row.reviewId);
    } else if (row.reviewId !== latestReviewId) {
      continue;
    }
    out.push(row);
  }

  return out;
}

/**
 * Groups PR files by role (classifyFile) and attaches each file's finding
 * lines. Pure: no LLM, no DB. `pseudocode_summary` and `split_suggestion.
 * too_big`/`proposed_splits` are left for the LLM step (later lessons).
 */
export function buildSmartDiff(
  files: { path: string; additions: number; deletions: number }[],
  findings: { file: string; startLine: number }[],
): SmartDiff {
  const linesByFile = new Map<string, number[]>();
  for (const f of findings) {
    const list = linesByFile.get(f.file) ?? [];
    list.push(f.startLine);
    linesByFile.set(f.file, list);
  }

  const filesByRole = new Map<string, typeof files>();
  for (const file of files) {
    const role = classifyFile(file.path);
    const list = filesByRole.get(role) ?? [];
    list.push(file);
    filesByRole.set(role, list);
  }

  const groups = ROLE_ORDER.filter((role) => filesByRole.has(role)).map((role) => ({
    role,
    files: filesByRole.get(role)!.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines: [...new Set(linesByFile.get(f.path) ?? [])].sort((a, b) => a - b),
    })),
  }));

  const total_lines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  return {
    groups,
    split_suggestion: { too_big: false, total_lines, proposed_splits: [] },
  };
}
