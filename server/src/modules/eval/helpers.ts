import type {
  EvalCase, EvalCaseInput, EvalCaseResult, EvalExpectationItem, EvalPrMeta, EvalRange, EvalRunDetail,
  EvalRunRecord, UnifiedDiff,
} from '@devdigest/shared';
import { MAX_DIFF_BYTES, RANGE_DAYS } from './constants.js';

/** AC-7: `must-find-<slug>` / `no-<slug>`, `-2`, `-3`… when the agent already has the name. */
export function caseNameFor(decision: 'accepted' | 'dismissed', title: string, existingNames: Iterable<string>): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 34) || 'finding';
  const base = `${decision === 'accepted' ? 'must-find-' : 'no-'}${slug}`;
  const taken = new Set(existingNames);
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  return name;
}

/** Mirrors `reviews/diff-loader.ts` `diffFromPrFiles`, so the frozen diff parses like a live one. */
export function fileDiffFragment(path: string, patch: string): string {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, patch].join('\n');
}

/** AC-10: some hunk of `file` has a new-side line inside [start, end]. */
export function rangeHasNewLine(diff: UnifiedDiff, file: string, start: number, end: number): boolean {
  return diff.files.some(
    (f) => f.path === file && f.hunks.some((h) => h.newLineNumbers.some((n) => n >= start && n <= end)),
  );
}

export type CaseInputError = { field: string; message: string };

/**
 * AC-27 rules in spec order. `diff` is the parsed `input_diff` (null when it does not
 * parse); `diffBytes` is its UTF-8 size, measured by the caller so this stays pure.
 */
export function validateCaseInput(input: EvalCaseInput, diff: UnifiedDiff | null, diffBytes: number): CaseInputError | null {
  const bad = (field: string, message: string): CaseInputError => ({ field, message });
  if (input.name.length < 1 || input.name.length > 80) return bad('name', 'Name must be 1-80 characters');
  if (!diff || !diff.files.some((f) => f.hunks.length > 0)) return bad('input_diff', 'Diff must contain at least one file with one hunk');
  if (diffBytes > MAX_DIFF_BYTES) return bad('input_diff', 'Diff must be at most 200 KB');
  if (input.expected.length < 1 || input.expected.length > 20) return bad('expected', 'Add 1-20 expectation items');
  for (const [i, it] of input.expected.entries()) {
    const at = `expected[${i}]`;
    if (!diff.files.some((f) => f.path === it.file)) return bad(`${at}.file`, 'File is not in the diff');
    if (it.start_line < 1) return bad(`${at}.start_line`, 'Start line must be at least 1');
    if (it.end_line < it.start_line) return bad(`${at}.end_line`, 'End line must be at least the start line');
    if (!rangeHasNewLine(diff, it.file, it.start_line, it.end_line)) return bad(`${at}.end_line`, 'Range has no changed line in the diff');
  }
  if (input.input_meta.title.length > 300) return bad('input_meta.title', 'Title must be at most 300 characters');
  if (input.input_meta.body.length > 10000) return bad('input_meta.body', 'Body must be at most 10,000 characters');
  return null;
}

/** Start of a history range; null for `all`. */
export function rangeStart(range: EvalRange, now: Date): Date | null {
  const days = RANGE_DAYS[range];
  return days === null ? null : new Date(now.getTime() - days * 86_400_000);
}

// Structural row types: `domain-pure` forbids importing `src/db` here (server/INSIGHTS.md).
interface CaseRowLike {
  id: string; agentId: string; name: string; expectationType: EvalCase['expectation_type'];
  expected: unknown; inputDiff: string; inputMeta: unknown; sourceFindingId: string | null;
  sourceDecision: EvalCase['source_decision']; lastResult: unknown; createdAt: Date;
}
interface RunRowLike {
  id: string; agentId: string; agentVersion: number; status: EvalRunRecord['status']; error: string | null;
  startedAt: Date; finishedAt: Date | null; config: unknown; casesDone: number; total: number; passed: number;
  errored: number; recall: number | null; precision: number | null; citationAccuracy: number | null;
  costUsd: number | null; durationMs: number | null;
}

export const toCaseDto = (r: CaseRowLike): EvalCase => ({
  id: r.id,
  agent_id: r.agentId,
  name: r.name,
  expectation_type: r.expectationType,
  expected: r.expected as EvalExpectationItem[],
  input_diff: r.inputDiff,
  input_meta: r.inputMeta as EvalPrMeta,
  source_finding_id: r.sourceFindingId,
  source_decision: r.sourceDecision,
  last_result: (r.lastResult as EvalCaseResult | null) ?? null,
  created_at: r.createdAt.toISOString(),
});

export const toRunRecordDto = (r: RunRowLike): EvalRunRecord => ({
  id: r.id,
  agent_id: r.agentId,
  agent_version: r.agentVersion,
  status: r.status,
  error: r.error,
  started_at: r.startedAt.toISOString(),
  finished_at: r.finishedAt?.toISOString() ?? null,
  cases_done: r.casesDone,
  total: r.total,
  passed: r.passed,
  errored: r.errored,
  recall: r.recall,
  precision: r.precision,
  citation_accuracy: r.citationAccuracy,
  cost_usd: r.costUsd,
  duration_ms: r.durationMs,
});

export const toRunDetailDto = (r: RunRowLike, results: { result: unknown }[]): EvalRunDetail => ({
  ...toRunRecordDto(r),
  config: r.config as EvalRunDetail['config'],
  results: results.map((x) => x.result as EvalCaseResult),
});
