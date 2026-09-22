import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { conventionsToDraft, slugifyRule } from "./helpers";

const c = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: "1",
  category: "style",
  rule: "Use async/await",
  evidence_path: "src/a.ts",
  evidence_start: 2,
  evidence_end: 3,
  evidence_snippet: "const r = await f();",
  evidence_url: "https://github.com/o/r/blob/abc/src/a.ts#L2-L3",
  confidence: 0.9,
  accepted: true,
  ...over,
});

describe("slugifyRule", () => {
  it("keeps the first four meaningful words, kebab-cased", () => {
    expect(slugifyRule("Always use async/await instead of .then() chains")).toBe("always-use-async-await");
    expect(slugifyRule("All the public route handlers return typed Result")).toBe("all-public-route-handlers");
  });
});

describe("conventionsToDraft", () => {
  it("merges the given conventions into one repo-conventions skill body", () => {
    const d = conventionsToDraft([c()], "quick-blog");
    expect(d.name).toBe("repo-conventions");
    expect(d.description).toBe("1 house conventions extracted from quick-blog");
    expect(d.body).toContain("# repo-conventions");
    expect(d.body).toContain("House conventions for `quick-blog`");
    expect(d.body).toContain("## use-async-await");
    expect(d.body).toContain("Use async/await");
    expect(d.body).toContain("[src/a.ts:2-3](https://github.com/o/r/blob/abc/src/a.ts#L2-L3)");
    expect(d.body).toContain("const r = await f();");
  });

  it("contains exactly the conventions it was given — a rejected one cannot leak in", () => {
    const d = conventionsToDraft([c({ rule: "Rule A" }), c({ id: "2", rule: "Rule B" })], "r");
    expect(d.body).toContain("Rule A");
    expect(d.body).toContain("Rule B");
    expect(d.body).not.toContain("Rule C");
    expect(d.description).toBe("2 house conventions extracted from r");
  });

  it("uses a fence longer than any backtick run in the snippet", () => {
    const d = conventionsToDraft([c({ evidence_snippet: "const s = `a`;\n```\nx\n```" })], "r");
    expect(d.body).toContain("````\nconst s");
  });
});
