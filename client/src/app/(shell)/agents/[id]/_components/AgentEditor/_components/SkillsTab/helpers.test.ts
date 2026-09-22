import { describe, it, expect } from "vitest";
import { reorderAttached, type SkillRow } from "./helpers";

const r = (skill_id: string, attached: boolean): SkillRow => ({
  skill_id, name: skill_id, description: "", type: "rubric", source: "manual",
  skill_enabled: true, attached, enabled: attached,
});
const ids = (rows: SkillRow[]) => rows.map((x) => x.skill_id);

describe("reorderAttached", () => {
  const rows = [r("a", true), r("b", true), r("c", true), r("x", false)];

  it("moves the dragged row to the target's position, shifting the others", () => {
    expect(ids(reorderAttached(rows, "c", "a"))).toEqual(["c", "a", "b", "x"]);
    expect(ids(reorderAttached(rows, "a", "c"))).toEqual(["b", "c", "a", "x"]);
  });

  it("keeps unattached rows after the attached ones", () => {
    expect(ids(reorderAttached(rows, "a", "b")).at(-1)).toBe("x");
  });

  it("returns the rows unchanged for unknown ids, an unattached row, or a self-drop", () => {
    expect(reorderAttached(rows, "zzz", "a")).toBe(rows);
    expect(reorderAttached(rows, "a", "x")).toBe(rows);
    expect(reorderAttached(rows, "x", "a")).toBe(rows);
    expect(reorderAttached(rows, "a", "a")).toBe(rows);
  });
});
