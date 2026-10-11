/* lib/eval.ts — pure display rules for the eval pipeline (SPEC-04). No React. */
import type { EvalCaseResult, EvalRunRecord } from "@devdigest/shared";

/** Server error codes that have `eval.errors.*` copy. */
export const EVAL_ERROR_CODES = [
  "finding_not_in_diff",
  "agent_missing",
  "finding_undecided",
  "case_input_too_large",
  "case_limit_reached",
  "eval_run_in_progress",
  "no_eval_cases",
  "no_api_key",
  "already_current",
  "run_not_done",
] as const;
export type EvalErrorCode = (typeof EVAL_ERROR_CODES)[number];

export function evalErrorCode(err: unknown): EvalErrorCode | null {
  const code = (err as { code?: unknown } | null)?.code;
  return EVAL_ERROR_CODES.find((c) => c === code) ?? null;
}

/** 0.666 → "67%"; null (empty denominator) → "—". */
export function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

/** Rounded percentage-point change of `a` against `b`; null when either is null. */
export function deltaPt(a: number | null, b: number | null): { dir: "up" | "down" | "flat"; n: number } | null {
  if (a == null || b == null) return null;
  const d = Math.round((a - b) * 100);
  return { dir: d > 0 ? "up" : d < 0 ? "down" : "flat", n: Math.abs(d) };
}

export type ResultLine = { kind: "never" } | { kind: "error"; reason: string } | { kind: "count"; expected: number; got: number };

/** Parts of a case's result line; the caller supplies the copy. */
export function resultLine(r: EvalCaseResult | null): ResultLine {
  if (!r) return { kind: "never" };
  if (r.status === "error") return { kind: "error", reason: r.error ?? "" };
  return { kind: "count", expected: r.expected_count, got: r.matched_count };
}

/** `runs` is newest first (the API order). */
const done = (runs: EvalRunRecord[]) => runs.filter((r) => r.status === "done");
export const latestDone = (runs: EvalRunRecord[]) => done(runs)[0];
export const previousDone = (runs: EvalRunRecord[]) => done(runs)[1];
