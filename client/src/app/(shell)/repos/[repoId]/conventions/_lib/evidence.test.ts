import { describe, it, expect } from "vitest";
import { formatEvidenceRange } from "./evidence";

describe("formatEvidenceRange", () => {
  it("formats a line range, collapsing a single line", () => {
    expect(formatEvidenceRange("src/a.ts", 23, 31)).toBe("src/a.ts:23-31");
    expect(formatEvidenceRange("src/a.ts", 5, 5)).toBe("src/a.ts:5");
  });
});
