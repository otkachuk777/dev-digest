import { describe, expect, it } from "vitest";
import { appendSkeleton, fieldGroup, fileSection, filesInDiff, firstNewLine, isJsonArray } from "./helpers";

const DIFF = [
  "diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts", "@@ -1,2 +1,3 @@", " x", "+y",
  "diff --git a/src/b.ts b/src/b.ts", "--- a/src/b.ts", "+++ b/src/b.ts", "@@ -10,2 +42,3 @@", " x", "+z",
].join("\n");
const PLAIN = "--- a/c.ts\n+++ b/c.ts\n@@ -1 +7 @@\n+q\n--- a/d.ts\n+++ b/d.ts\n@@ -1 +3 @@\n+r";

describe("EvalCaseModal helpers", () => {
  it("AC-24: lists files and slices one file's section", () => {
    expect(filesInDiff(DIFF)).toEqual(["a.ts", "src/b.ts"]);
    expect(filesInDiff(PLAIN)).toEqual(["c.ts", "d.ts"]);
    expect(fileSection(DIFF, "src/b.ts")).toContain("+z");
    expect(fileSection(DIFF, "src/b.ts")).not.toContain("+y");
  });
  it("AC-26: skeleton uses the first file and its first new-side line", () => {
    expect(firstNewLine(DIFF, "src/b.ts")).toBe(42);
    expect(JSON.parse(appendSkeleton("[]", DIFF))).toEqual([{ file: "a.ts", start_line: 1, end_line: 1 }]);
    expect(JSON.parse(appendSkeleton(appendSkeleton("[]", PLAIN), PLAIN))).toHaveLength(2);
  });
  it("AC-25: isJsonArray", () => {
    expect(isJsonArray("[]")).toBe(true);
    expect(isJsonArray("{}")).toBe(false);
    expect(isJsonArray("[")).toBe(false);
  });
  it("amendment 4: item-level expectation errors belong to the Expected editor", () => {
    expect(fieldGroup("expected.0.start_line")).toBe("expected");
    expect(fieldGroup("expected")).toBe("expected");
    expect(fieldGroup("input_meta.title")).toBe("meta");
    expect(fieldGroup("input_diff")).toBe("diff");
    expect(fieldGroup("name")).toBe("name");
  });
});
