import { describe, it, expect, vi, afterEach } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { acceptedOf, scanWhen } from "./helpers";

afterEach(() => vi.useRealTimers());

describe("ConventionsView helpers", () => {
  it("acceptedOf keeps only accepted candidates", () => {
    const list = [{ id: "a", accepted: true }, { id: "b", accepted: false }] as ConventionCandidate[];
    expect(acceptedOf(list).map((c) => c.id)).toEqual(["a"]);
  });

  it("scanWhen reads as a sentence fragment", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-21T12:00:00Z"));
    expect(scanWhen("2026-09-21T11:00:00Z")).toBe("1h ago");
    expect(scanWhen("2026-09-21T11:59:50Z")).toBe("just now");
    expect(scanWhen(null)).toBe("—");
  });
});
