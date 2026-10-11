import { describe, it, expect } from "vitest";
import type { EvalRunRecord } from "@devdigest/shared";
import { parseRange, trend } from "./helpers";

const run = (o: Partial<EvalRunRecord>): EvalRunRecord => ({
  id: "r", agent_id: "a", agent_version: 1, status: "done", error: null, started_at: "", finished_at: null,
  cases_done: 0, total: 4, passed: 3, errored: 0, recall: 0.5, precision: 0.5, citation_accuracy: 0.5, cost_usd: null, duration_ms: null, ...o,
});

describe("parseRange", () => {
  it("AC-76: valid values pass, anything else falls back to 30d", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("all")).toBe("all");
    expect(parseRange("xx")).toBe("30d");
    expect(parseRange(null)).toBe("30d");
  });
});

describe("trend", () => {
  it("done runs in time order (oldest first); failed runs and null values skipped", () => {
    const runs = [run({ recall: 0.9 }), run({ status: "failed", recall: 0 }), run({ recall: null }), run({ recall: 0.5 })];
    expect(trend(runs, "recall")).toEqual([0.5, 0.9]);
  });
});
