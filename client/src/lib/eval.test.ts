import { describe, expect, it } from "vitest";
import type { EvalCaseResult, EvalRunRecord } from "@devdigest/shared";
import { deltaPt, evalErrorCode, latestDone, pct, previousDone, resultLine } from "./eval";

const run = (o: Partial<EvalRunRecord>): EvalRunRecord => ({
  id: "r", agent_id: "a", agent_version: 1, status: "done", error: null, started_at: "", finished_at: null,
  cases_done: 0, total: 0, passed: 0, errored: 0, recall: null, precision: null, citation_accuracy: null,
  cost_usd: null, duration_ms: null, ...o,
});
const result = (o: Partial<EvalCaseResult>): EvalCaseResult => ({
  case_id: "c", case_name: "n", expectation_type: "must_find", status: "pass", expected_count: 2, matched_count: 1,
  findings: [], dropped_count: 0, error: null, duration_ms: 1, cost_usd: null, ran_at: "", ...o,
});

describe("lib/eval", () => {
  it("AC-57: pct shows — for null and rounds to a percent", () => {
    expect(pct(null)).toBe("—");
    expect(pct(0.666)).toBe("67%");
    expect(pct(0)).toBe("0%");
  });

  it("AC-16/57: deltaPt is null when either side is null, else rounded points with direction", () => {
    expect(deltaPt(null, 0.5)).toBeNull();
    expect(deltaPt(0.5, null)).toBeNull();
    expect(deltaPt(0.75, 0.5)).toEqual({ dir: "up", n: 25 });
    expect(deltaPt(0.5, 0.666)).toEqual({ dir: "down", n: 17 });
    expect(deltaPt(0.5, 0.5)).toEqual({ dir: "flat", n: 0 });
  });

  it("AC-20: resultLine returns never / error / counts parts", () => {
    expect(resultLine(null)).toEqual({ kind: "never" });
    expect(resultLine(result({ status: "error", error: "boom" }))).toEqual({ kind: "error", reason: "boom" });
    expect(resultLine(result({}))).toEqual({ kind: "count", expected: 2, got: 1 });
    expect(resultLine(result({ expectation_type: "must_not_flag", expected_count: 0, matched_count: 2 }))).toEqual({
      kind: "count", expected: 0, got: 2,
    });
  });

  it("AC-16: latestDone / previousDone skip running and failed runs (newest first)", () => {
    const runs = [run({ id: "1", status: "running" }), run({ id: "2" }), run({ id: "3", status: "failed" }), run({ id: "4" })];
    expect(latestDone(runs)?.id).toBe("2");
    expect(previousDone(runs)?.id).toBe("4");
    expect(previousDone([run({ id: "x" })])).toBeUndefined();
  });

  it("AC-49: evalErrorCode returns a known server code, else null", () => {
    expect(evalErrorCode({ code: "no_api_key" })).toBe("no_api_key");
    expect(evalErrorCode({ code: "weird" })).toBeNull();
    expect(evalErrorCode(new Error("x"))).toBeNull();
  });
});
