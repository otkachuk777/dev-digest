import { describe, it, expect } from "vitest";
import type { Agent, EvalCaseResult, EvalRunConfig } from "@devdigest/shared";
import { caseSetNote, configDiffLines, isCurrent, orderRuns, wordDiff } from "./helpers";

const cfg = (o: Partial<EvalRunConfig> = {}): EvalRunConfig => ({
  provider: "openai", model: "gpt-4.1", system_prompt: "p", strategy: "single-pass", skills: [], ...o,
});
const skill = (o: Partial<EvalRunConfig["skills"][number]> = {}) => ({ skill_id: "s1", name: "sql", version: 1, body: "b", ...o });
const res = (id: string | null, name: string) => ({ case_id: id, case_name: name }) as unknown as EvalCaseResult;

describe("wordDiff", () => {
  it("identical prompts are one unchanged run", () => {
    expect(wordDiff("a b", "a b")).toEqual([{ op: "same", text: "a b" }]);
  });
  it("marks added and removed words", () => {
    const d = wordDiff("be strict now", "be very strict");
    expect(d.filter((x) => x.op === "add").map((x) => x.text)).toContain("very");
    expect(d.filter((x) => x.op === "del").map((x) => x.text)).toContain("now");
    expect(d.filter((x) => x.op !== "del").map((x) => x.text).join("")).toBe("be very strict");
    expect(d.filter((x) => x.op !== "add").map((x) => x.text).join("")).toBe("be strict now");
  });
  it("empty side is all add / all del", () => {
    expect(wordDiff("", "x")).toEqual([{ op: "add", text: "x" }]);
    expect(wordDiff("x", "")).toEqual([{ op: "del", text: "x" }]);
  });
  it("amendment #1: a ~3000-token prompt differing in one word is fast and exact", () => {
    const words = Array.from({ length: 3000 }, (_, i) => `w${i}`);
    const b = [...words]; b[1500] = "CHANGED";
    const t0 = performance.now();
    const d = wordDiff(words.join(" "), b.join(" "));
    expect(performance.now() - t0).toBeLessThan(200);
    expect(d.filter((x) => x.op !== "same").map((x) => `${x.op}:${x.text}`)).toEqual(["del:w1500", "add:CHANGED"]);
  });
  it("amendment #1: fully different 2000-word prompts neither freeze nor lose text", () => {
    const a = Array.from({ length: 2000 }, (_, i) => `a${i}`).join(" "), b = Array.from({ length: 2000 }, (_, i) => `b${i}`).join(" ");
    const d = wordDiff(a, b);
    expect(d.filter((x) => x.op !== "add").map((x) => x.text).join("")).toBe(a);
    expect(d.filter((x) => x.op !== "del").map((x) => x.text).join("")).toBe(b);
  });
});

describe("configDiffLines (AC-66)", () => {
  it("lists model, provider, strategy", () => {
    expect(configDiffLines(cfg(), cfg({ model: "m2", provider: "anthropic", strategy: "map-reduce" }))).toEqual([
      { kind: "model", from: "gpt-4.1", to: "m2" },
      { kind: "provider", from: "openai", to: "anthropic" },
      { kind: "strategy", from: "single-pass", to: "map-reduce" },
    ]);
  });
  it("EC-17: skill changed by version, added, removed", () => {
    expect(configDiffLines(cfg({ skills: [skill()] }), cfg({ skills: [skill({ version: 2 })] }))).toEqual([{ kind: "skillChanged", name: "sql", from: 1, to: 2 }]);
    expect(configDiffLines(cfg({ skills: [skill()] }), cfg({ skills: [skill({ skill_id: "s2", name: "xss" })] }))).toEqual([{ kind: "skillAdded", name: "xss" }, { kind: "skillRemoved", name: "sql" }]);
    expect(configDiffLines(cfg({ skills: [skill()] }), cfg({ skills: [skill()] }))).toEqual([]);
  });
});

describe("caseSetNote (AC-67, EC-18)", () => {
  it("counts common and only-in-one by case_id ?? case_name", () => {
    expect(caseSetNote([res("1", "a"), res("2", "b")], [res("1", "a"), res("3", "c"), res(null, "d")])).toEqual({ common: 1, onlyA: 1, onlyB: 2 });
  });
});

describe("isCurrent (AC-68)", () => {
  const agent = { provider: "openai", model: "gpt-4.1", system_prompt: "p", strategy: "single-pass" } as Agent;
  it("compares provider, model, prompt, strategy", () => {
    expect(isCurrent(cfg(), agent)).toBe(true);
    expect(isCurrent(cfg({ system_prompt: "q" }), agent)).toBe(false);
    expect(isCurrent(cfg({ strategy: "map-reduce" }), agent)).toBe(false);
  });
  it("a null agent strategy means the default single-pass", () => {
    expect(isCurrent(cfg(), { ...agent, strategy: null } as unknown as Agent)).toBe(true);
    expect(isCurrent(cfg({ strategy: "map-reduce" }), { ...agent, strategy: null } as unknown as Agent)).toBe(false);
  });
  it("a stale agent (older version) is not current; the refreshed one is", () => {
    const v8 = cfg({ system_prompt: "v8 prompt", model: "m2" });
    expect(isCurrent(v8, agent)).toBe(false);
    expect(isCurrent(v8, { ...agent, system_prompt: "v8 prompt", model: "m2" } as Agent)).toBe(true);
  });
});

describe("orderRuns", () => {
  it("older started_at first regardless of click order", () => {
    expect(orderRuns({ started_at: "2026-10-02" }, { started_at: "2026-10-01" }).map((r) => r.started_at)).toEqual(["2026-10-01", "2026-10-02"]);
  });
});
