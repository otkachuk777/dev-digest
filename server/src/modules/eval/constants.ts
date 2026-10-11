import type { EvalRange } from '@devdigest/shared';

/** 200 KB, measured as UTF-8 bytes of the frozen diff (AC-14, NFR-4). */
export const MAX_DIFF_BYTES = 200 * 1024;
export const MAX_CASES_PER_AGENT = 50;
export const CASE_TIMEOUT_MS = 120_000;
/** A `running` row older than this (cases cap x per-case timeout + 5 min) cannot be alive: reap it on the next start. */
export const STALE_RUN_MS = MAX_CASES_PER_AGENT * CASE_TIMEOUT_MS + 5 * 60_000;
export const RUN_LIST_LIMIT = 100;
export const RECENT_RUNS = 6;
export const TREND_POINTS = 10;
export const RANGE_DAYS: Record<EvalRange, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null };
