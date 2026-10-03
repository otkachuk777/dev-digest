import { describe, expect, it } from "vitest";
import { NAV, resolveHref } from "./nav";

describe("NAV", () => {
  it("AC-14: has a Project Context item resolving to /repos/<id>/context", () => {
    const item = NAV.flatMap((g) => g.items).find((i) => i.label === "Project Context");
    expect(item).toBeDefined();
    expect(resolveHref(item!.href, "r1")).toBe("/repos/r1/context");
  });

  it("SPEC-02 AC-1: Onboarding Tour sits in WORKSPACE between Pull Requests and Project Context and links to /repos/<id>/onboarding", () => {
    const group = NAV.find((g) => g.section === "WORKSPACE")!;
    const labels = group.items.map((i) => i.label);
    expect(labels.indexOf("Onboarding Tour")).toBeGreaterThan(-1);
    expect(labels.indexOf("Onboarding Tour")).toBe(labels.indexOf("Pull Requests") + 1);
    expect(labels.indexOf("Project Context")).toBe(labels.indexOf("Onboarding Tour") + 1);
    const item = group.items.find((i) => i.label === "Onboarding Tour")!;
    expect(item.key).toBe("onboarding-tour");
    expect(resolveHref(item.href, "r1")).toBe("/repos/r1/onboarding");
  });
});
