import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, EvalRunDetail } from "@devdigest/shared";
import evalMessages from "../../../../../../../messages/en/eval.json";

const h = vi.hoisted(() => ({ details: {} as Record<string, unknown>, promote: vi.fn() }));
vi.mock("@/lib/api/eval", () => ({
  useEvalRun: (id: string) => ({ data: h.details[id] }),
  usePromoteRun: () => ({ mutate: h.promote, isPending: false }),
}));
import { CompareModal } from "./CompareModal";

const detail = (o: Partial<EvalRunDetail> & { id: string }): EvalRunDetail =>
  ({
    agent_id: "ag1", agent_version: 1, status: "done", error: null, started_at: "2026-10-01T10:00:00Z", finished_at: null,
    cases_done: 2, total: 2, passed: 2, errored: 0, recall: 0.5, precision: 0.8, citation_accuracy: 0.5, cost_usd: 0.1, duration_ms: null,
    config: { provider: "openai", model: "gpt-4.1", system_prompt: "be strict", strategy: "single-pass", skills: [] },
    results: [{ case_id: "c1", case_name: "one" }, { case_id: "c2", case_name: "two" }],
    ...o,
  }) as unknown as EvalRunDetail;
const agent = { provider: "openai", model: "gpt-4.1", system_prompt: "other", strategy: "single-pass" } as Agent;
const onClose = vi.fn();

function renderIt(a: Agent = agent, ids: [string, string] = ["r1", "r2"]) {
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <CompareModal agent={a} ids={ids} onClose={onClose} />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  h.details = {
    r1: detail({ id: "r1", agent_version: 1 }),
    r2: detail({
      id: "r2", agent_version: 2, started_at: "2026-10-02T10:00:00Z", recall: 0.75, precision: 0.7, citation_accuracy: null, cost_usd: 0.35,
      config: { provider: "openai", model: "gpt-4.1", system_prompt: "be very strict", strategy: "single-pass", skills: [] },
    }),
  };
});
afterEach(cleanup);

describe("CompareModal", () => {
  it("AC-64: title/subtitle with the older run first even when clicked newest-first; tiles with deltas", () => {
    renderIt(agent, ["r2", "r1"]);
    expect(screen.getByText("Compare runs · v1 → v2")).toBeInTheDocument();
    expect(screen.getByText("Old prompt vs new — metric deltas and prompt diff on 2 common cases")).toBeInTheDocument();
    expect(screen.getByText("▲ 25pt")).toBeInTheDocument();
    expect(screen.getByText("▼ 10pt")).toBeInTheDocument();
    expect(screen.getByText("▲ $0.25")).toBeInTheDocument();
    // null citation: dash, no delta
    expect(screen.getAllByText("50%").length).toBe(2);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("AC-65: legend, struck-through deletions, added words; plain-text rendering", () => {
    renderIt();
    expect(screen.getByText("v1 (old)")).toBeInTheDocument();
    expect(screen.getByText("v2 (new)")).toBeInTheDocument();
    expect(screen.getByText("very").tagName).toBe("INS");
  });

  it("AC-65 / EC-17: identical prompts show 'No system prompt change' plus the skill change", () => {
    const same = { provider: "openai", model: "gpt-4.1", system_prompt: "p", strategy: "single-pass" };
    h.details = {
      r1: detail({ id: "r1", config: { ...same, skills: [{ skill_id: "s", name: "sql", version: 1, body: "a" }] } as never }),
      r2: detail({ id: "r2", agent_version: 1, started_at: "2026-10-02T10:00:00Z", config: { ...same, skills: [{ skill_id: "s", name: "sql", version: 2, body: "b" }] } as never }),
    };
    renderIt();
    expect(screen.getByText("No system prompt change")).toBeInTheDocument();
    expect(screen.getByText("Skill changed: sql v1 → v2")).toBeInTheDocument();
  });

  it("AC-67 / EC-18: different case sets get the footnote and the common count", () => {
    h.details.r2 = { ...(h.details.r2 as object), results: [{ case_id: "c1", case_name: "one" }, { case_id: "c3", case_name: "three" }] };
    renderIt();
    expect(screen.getByText("Metrics cover different case sets: 1 case(s) only in v1, 1 only in v2.")).toBeInTheDocument();
    expect(screen.getByText(/on 1 common cases/)).toBeInTheDocument();
  });

  it("AC-68 / EC-19: Promote disabled with the tooltip when B equals the current config", () => {
    renderIt({ ...agent, system_prompt: "be very strict" });
    expect(screen.getByRole("button", { name: "Promote v2" })).toBeDisabled();
    expect(screen.getByTitle("v2 is the current config")).toBeInTheDocument();
  });

  it("AC-69: confirm dialog text, then promote runs for run B", () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Promote v2" }));
    expect(screen.getByText("Promote v2? The agent's provider, model, system prompt and strategy will be set to v2's. Linked skills are not changed. This creates a new version.")).toBeInTheDocument();
    expect(h.promote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Promote" }));
    expect(h.promote).toHaveBeenCalledWith({ runId: "r2", version: 2 }, expect.anything());
  });
});
