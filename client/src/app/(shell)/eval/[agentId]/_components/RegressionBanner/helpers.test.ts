import { describe, it, expect } from "vitest";
import type { EvalCaseResult, EvalRunDetail, EvalRunRecord } from "@devdigest/shared";
import { bannerSentences } from "./helpers";

const run = (o: Partial<EvalRunRecord>): EvalRunRecord => ({
  id: "r", agent_id: "a", agent_version: 1, status: "done", error: null, started_at: "", finished_at: null,
  cases_done: 0, total: 4, passed: 3, errored: 0, recall: 0.5, precision: 0.5, citation_accuracy: 0.5, cost_usd: null, duration_ms: null, ...o,
});
const res = (name: string, status: "pass" | "fail", id: string | null = name): EvalCaseResult => ({
  case_id: id, case_name: name, expectation_type: "must_find", status, expected_count: 1, matched_count: 1,
  findings: [], dropped_count: 0, error: null, duration_ms: 1, cost_usd: null, ran_at: "",
} as EvalCaseResult);
const detail = (r: EvalRunRecord, results: EvalCaseResult[]) => ({ ...r, config: {}, results }) as unknown as EvalRunDetail;

describe("bannerSentences", () => {
  it("EC-21: drops first, then rises, then newly failing cases", () => {
    const prev = run({ agent_version: 6, recall: 0.5, precision: 0.8 });
    const latest = run({ agent_version: 7, recall: 0.53, precision: 0.78 });
    const s = bannerSentences(latest, prev, detail(latest, [res("x", "fail"), res("y", "pass")]), detail(prev, [res("x", "pass"), res("y", "pass")]));
    expect(s).toEqual([
      { kind: "dropped", metric: "precision", n: 2, from: 6, to: 7 },
      { kind: "up", metric: "recall", n: 3 },
      { kind: "failing", names: ["x"] },
    ]);
  });
  it("no metric dropped by 1pt or more -> no sentences", () => {
    const prev = run({ precision: 0.8 });
    expect(bannerSentences(run({ precision: 0.796, recall: 0.6 }), prev, undefined, undefined)).toEqual([]);
  });
  it("null metrics are skipped; details missing -> no failing sentence", () => {
    const s = bannerSentences(run({ recall: 0.4, citation_accuracy: null }), run({ recall: 0.5, citation_accuracy: 0.9 }), undefined, undefined);
    expect(s).toEqual([{ kind: "dropped", metric: "recall", n: 10, from: 1, to: 1 }]);
  });
  it("cases match by case_id, falling back to case_name", () => {
    const prev = run({ recall: 0.9 }), latest = run({ recall: 0.5 });
    const s = bannerSentences(latest, prev, detail(latest, [res("renamed", "fail", "c1"), res("gone", "fail", null)]), detail(prev, [res("old name", "pass", "c1"), res("gone", "pass", null)]));
    expect(s.at(-1)).toEqual({ kind: "failing", names: ["renamed", "gone"] });
  });
});
