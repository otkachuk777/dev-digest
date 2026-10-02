import { describe, expect, it } from "vitest";
import { NAV, resolveHref } from "./nav";

describe("NAV", () => {
  it("AC-14: has a Project Context item resolving to /repos/<id>/context", () => {
    const item = NAV.flatMap((g) => g.items).find((i) => i.label === "Project Context");
    expect(item).toBeDefined();
    expect(resolveHref(item!.href, "r1")).toBe("/repos/r1/context");
  });
});
