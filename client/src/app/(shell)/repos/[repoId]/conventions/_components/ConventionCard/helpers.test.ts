import { describe, it, expect } from "vitest";
import { confidenceColor, confidencePercent, formatEvidenceRange } from "./helpers";

describe("ConventionCard helpers", () => {
  it("colours confidence green from 0.85 up, amber below", () => {
    expect(confidenceColor(0.85)).toBe("var(--ok)");
    expect(confidenceColor(0.91)).toBe("var(--ok)");
    expect(confidenceColor(0.78)).toBe("var(--warn)");
  });
  it("rounds confidence to a whole percent", () => {
    expect(confidencePercent(0.914)).toBe(91);
  });
  it("formats a line range, collapsing a single line", () => {
    expect(formatEvidenceRange("src/a.ts", 23, 31)).toBe("src/a.ts:23-31");
    expect(formatEvidenceRange("src/a.ts", 5, 5)).toBe("src/a.ts:5");
  });
});
