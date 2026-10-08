import type { EvalRunDetail, EvalRunRecord } from "@devdigest/shared";
import { deltaPt } from "@/lib/eval";

export type BannerMetric = "recall" | "precision" | "citation";
export type BannerSentence =
  | { kind: "dropped"; metric: BannerMetric; n: number; from: number; to: number }
  | { kind: "up"; metric: BannerMetric; n: number }
  | { kind: "failing"; names: string[] };

const METRICS: [BannerMetric, "recall" | "precision" | "citation_accuracy"][] = [
  ["recall", "recall"],
  ["precision", "precision"],
  ["citation", "citation_accuracy"],
];

/** Template sentences for the regression banner (AC-79). Empty array → no banner: no metric dropped by ≥ 1pt.
 *  Order: drops, rises, then cases that passed in `prev` and fail in `latest`. */
export function bannerSentences(
  latest: EvalRunRecord,
  prev: EvalRunRecord,
  latestDetail?: EvalRunDetail,
  prevDetail?: EvalRunDetail,
): BannerSentence[] {
  const deltas = METRICS.map(([metric, key]) => ({ metric, d: deltaPt(latest[key], prev[key]) }));
  const dropped = deltas.filter((x) => x.d?.dir === "down");
  if (dropped.length === 0) return [];
  const out: BannerSentence[] = dropped.map((x) => ({
    kind: "dropped", metric: x.metric, n: x.d!.n, from: prev.agent_version, to: latest.agent_version,
  }));
  for (const x of deltas) if (x.d?.dir === "up") out.push({ kind: "up", metric: x.metric, n: x.d.n });
  if (latestDetail && prevDetail) {
    const key = (r: { case_id: string | null; case_name: string }) => r.case_id ?? r.case_name;
    const wasPassing = new Set(prevDetail.results.filter((r) => r.status === "pass").map(key));
    const names = latestDetail.results.filter((r) => r.status === "fail" && wasPassing.has(key(r))).map((r) => r.case_name);
    if (names.length) out.push({ kind: "failing", names });
  }
  return out;
}
