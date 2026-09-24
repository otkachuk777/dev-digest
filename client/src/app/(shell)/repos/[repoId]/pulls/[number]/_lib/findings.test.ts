import { describe, expect, it } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { latestFindingsPerAgent } from "./findings";

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "t",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    review_id: "rev1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rev1",
    pr_id: "pr1",
    agent_id: "agent1",
    run_id: "run1",
    agent_name: "Sec",
    kind: "review",
    verdict: "comment",
    summary: null,
    score: 90,
    model: "gpt",
    grounding: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
    ...overrides,
  };
}

describe("latestFindingsPerAgent", () => {
  it("keeps only the newest review's findings when an agent re-runs", () => {
    const newer = review({
      id: "rev2",
      findings: [finding({ id: "f-new", review_id: "rev2", file: "src/a.ts" })],
    });
    const older = review({
      id: "rev1",
      findings: [finding({ id: "f-old", review_id: "rev1", file: "src/a.ts" })],
    });
    const byPath = latestFindingsPerAgent([newer, older]);
    expect(byPath.get("src/a.ts")?.map((f) => f.id)).toEqual(["f-new"]);
  });

  it("merges findings from two different agents", () => {
    const a = review({
      id: "rev-a",
      agent_id: "agent-a",
      findings: [finding({ id: "f-a", review_id: "rev-a", file: "src/a.ts" })],
    });
    const b = review({
      id: "rev-b",
      agent_id: "agent-b",
      findings: [finding({ id: "f-b", review_id: "rev-b", file: "src/a.ts" })],
    });
    const byPath = latestFindingsPerAgent([a, b]);
    expect(byPath.get("src/a.ts")?.map((f) => f.id).sort()).toEqual(["f-a", "f-b"]);
  });

  it("ignores summary reviews", () => {
    const summary = review({
      id: "rev-s",
      kind: "summary",
      findings: [finding({ id: "f-s", review_id: "rev-s", file: "src/a.ts" })],
    });
    const byPath = latestFindingsPerAgent([summary]);
    expect(byPath.size).toBe(0);
  });

  it("groups findings by file path", () => {
    const r = review({
      findings: [
        finding({ id: "f1", file: "src/a.ts" }),
        finding({ id: "f2", file: "src/b.ts" }),
      ],
    });
    const byPath = latestFindingsPerAgent([r]);
    expect(byPath.get("src/a.ts")?.map((f) => f.id)).toEqual(["f1"]);
    expect(byPath.get("src/b.ts")?.map((f) => f.id)).toEqual(["f2"]);
  });
});
