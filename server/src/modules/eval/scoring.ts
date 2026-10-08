import type { EvalExpectationType } from '@devdigest/shared';

/** Pure scoring (AC-51..59): no LLM, no I/O (AC-60). */
type Span = { file: string; start_line: number; end_line: number };

export interface CaseScore {
  type: EvalExpectationType;
  status: 'pass' | 'fail' | 'error';
  /** must_find: item count. must_not_flag: 0 (the UI says "expected 0 findings"). */
  expectedCount: number;
  /** must_find: matched items. must_not_flag: matching findings. */
  matchedCount: number;
  /** Kept findings matching a must_find item of this case. */
  tp: number;
  /** Kept findings matching a must_not_flag item of this case. */
  fp: number;
  kept: number;
  dropped: number;
  costUsd: number | null;
}

/** AC-51: same file, and the inclusive ranges share at least one line. */
export function matches(finding: Span, item: Span): boolean {
  return finding.file === item.file && finding.start_line <= item.end_line && item.start_line <= finding.end_line;
}

/** AC-52, AC-53. */
export function scoreCase(
  type: EvalExpectationType,
  items: Span[],
  kept: Span[],
  droppedCount: number,
): Omit<CaseScore, 'type' | 'costUsd'> {
  const hits = kept.filter((f) => items.some((i) => matches(f, i))).length;
  const base = { kept: kept.length, dropped: droppedCount };
  if (type === 'must_find') {
    const matched = items.filter((i) => kept.some((f) => matches(f, i))).length;
    return { ...base, status: matched === items.length ? 'pass' : 'fail', expectedCount: items.length, matchedCount: matched, tp: hits, fp: 0 };
  }
  return { ...base, status: hits === 0 ? 'pass' : 'fail', expectedCount: 0, matchedCount: hits, tp: 0, fp: hits };
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

/** AC-54..59: errored cases are left out of every metric (EC-16). */
export function scoreRun(cases: CaseScore[]) {
  const ok = cases.filter((c) => c.status !== 'error');
  const sum = (f: (c: CaseScore) => number, from = ok) => from.reduce((a, c) => a + f(c), 0);
  const mf = ok.filter((c) => c.type === 'must_find');
  const tp = sum((c) => c.tp);
  const kept = sum((c) => c.kept);
  return {
    recall: ratio(sum((c) => c.matchedCount, mf), sum((c) => c.expectedCount, mf)),
    precision: ratio(tp, tp + sum((c) => c.fp)),
    citationAccuracy: ratio(kept, kept + sum((c) => c.dropped)),
    passed: cases.filter((c) => c.status === 'pass').length,
    total: cases.length,
    errored: cases.length - ok.length,
    costUsd: ok.some((c) => c.costUsd === null) ? null : sum((c) => c.costUsd ?? 0, cases),
  };
}
