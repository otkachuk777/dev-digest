import { describe, expect, it } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("AC-2: /repos/<id>/onboarding marks the Onboarding Tour item", () => {
    expect(activeKeyFor("/repos/r1/onboarding")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/r1/onboarding/")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/0b1f-uuid/onboarding")).toBe("onboarding-tour");
  });

  it("AC-3: the add-repository route /onboarding marks nothing", () => {
    expect(activeKeyFor("/onboarding")).toBe("");
    expect(activeKeyFor("/onboarding/")).toBe("");
  });

  it("other repo routes keep their keys", () => {
    expect(activeKeyFor("/repos/r1/pulls")).toBe("pulls");
    expect(activeKeyFor("/repos/r1/pulls/12")).toBe("pulls");
    expect(activeKeyFor("/repos/r1/context")).toBe("context");
    expect(activeKeyFor("/repos/r1/conventions")).toBe("conventions");
  });
});
