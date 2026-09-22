import { describe, it, expect } from "vitest";
import { estimateTokens } from "./tokens";

describe("estimateTokens", () => {
  it("is chars / 4, rounded", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("x".repeat(400))).toBe(100);
    expect(estimateTokens("abcde")).toBe(1);
  });
});
