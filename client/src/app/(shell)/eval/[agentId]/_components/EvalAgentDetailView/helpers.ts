import { EvalRange, type EvalRunRecord } from "@devdigest/shared";

export const DEFAULT_RANGE: EvalRange = "30d";

/** `?range=` is untrusted input: anything but 7d|30d|90d|all falls back to 30 days (AC-76). */
export function parseRange(raw: string | null): EvalRange {
  const r = EvalRange.safeParse(raw);
  return r.success ? r.data : DEFAULT_RANGE;
}

export type MetricKey = "recall" | "precision" | "citation_accuracy";

/** Values of the done runs in time order (`runs` is newest first); runs with a null value are skipped. */
export function trend(runs: EvalRunRecord[], key: MetricKey): number[] {
  return runs
    .filter((r) => r.status === "done")
    .map((r) => r[key])
    .filter((v): v is number => v != null)
    .reverse();
}
