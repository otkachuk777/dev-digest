import { describe, it, expect } from "vitest";
import { lineDiff } from "./helpers";

describe("lineDiff", () => {
  it("marks unchanged, removed and added lines in order", () => {
    expect(lineDiff("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "B" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
  });

  it("is all-same for identical text", () => {
    expect(lineDiff("x\ny", "x\ny").every((l) => l.type === "same")).toBe(true);
  });

  it("handles an empty side", () => {
    expect(lineDiff("", "a")).toEqual([{ type: "del", text: "" }, { type: "add", text: "a" }]);
    expect(lineDiff("a\nb", "a")).toEqual([{ type: "same", text: "a" }, { type: "del", text: "b" }]);
  });

  it("degrades to remove-all / add-all instead of blowing up on huge inputs", () => {
    const big = Array.from({ length: 3000 }, (_, i) => `line ${i}`).join("\n");
    const other = Array.from({ length: 3000 }, (_, i) => `other ${i}`).join("\n");
    const out = lineDiff(big, other);
    expect(out.filter((l) => l.type === "del")).toHaveLength(3000);
    expect(out.filter((l) => l.type === "add")).toHaveLength(3000);
  });
});
