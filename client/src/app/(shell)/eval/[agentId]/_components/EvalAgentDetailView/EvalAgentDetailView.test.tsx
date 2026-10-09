import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../../messages/en/eval.json";

const h = vi.hoisted(() => ({
  range: null as string | null,
  agent: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown },
  runs: [] as EvalRunRecord[], cases: [] as unknown[], details: {} as Record<string, unknown>,
  refetch: vi.fn(), replace: vi.fn(), push: vi.fn(), crumb: vi.fn(), start: vi.fn(), running: false,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ agentId: "ag1" }),
  useSearchParams: () => new URLSearchParams(h.range ? `range=${h.range}` : ""),
  useRouter: () => ({ replace: h.replace, push: h.push }),
}));
vi.mock("@/components/app-shell", () => ({ ShellCrumb: (p: { items: unknown }) => { h.crumb(p.items); return null; } }));
vi.mock("@/lib/api/agents", () => ({
  useAgents: () => ({ data: [{ id: "ag1", name: "Security Reviewer" }, { id: "ag2", name: "Style Reviewer" }] }),
  useAgent: () => ({ ...h.agent, refetch: h.refetch }),
}));
vi.mock("@/lib/api/eval", () => ({
  useEvalRuns: (_id: string, range: string) => { h.crumb({ range }); return { data: h.runs, isLoading: false }; },
  useEvalCases: () => ({ data: h.cases }),
  useEvalRun: (id: string | undefined) => ({ data: id ? h.details[id] : undefined }),
  useStartEvalRun: () => ({ mutate: h.start, isPending: false }),
  usePromoteRun: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@devdigest/ui", async (orig) => ({ ...(await orig<object>()), LineChart: (p: { series: { name: string; data: number[] }[] }) => <div data-testid="chart">{JSON.stringify(p.series.map((s) => [s.name, s.data]))}</div> }));

import { ApiError } from "@/lib/api/client";
import { EvalAgentDetailView } from "./EvalAgentDetailView";

const run = (o: Partial<EvalRunRecord>): EvalRunRecord => ({
  id: "r", agent_id: "ag1", agent_version: 1, status: "done", error: null, started_at: "2026-10-01T10:00:00Z", finished_at: null,
  cases_done: 4, total: 4, passed: 3, errored: 0, recall: 0.75, precision: 0.5, citation_accuracy: null, cost_usd: null, duration_ms: null, ...o,
});
const detail = (id: string, v: number) => ({
  ...run({ id, agent_version: v, started_at: `2026-10-0${v}T10:00:00Z` }),
  config: { provider: "openai", model: "gpt-4.1", system_prompt: `prompt v${v}`, strategy: "single-pass", skills: [] },
  results: [],
});
const openCompare = () => {
  fireEvent.click(screen.getByRole("checkbox", { name: /^Select run v2 / }));
  fireEvent.click(screen.getByRole("checkbox", { name: /^Select run v1 / }));
  fireEvent.click(screen.getByRole("button", { name: "Compare" }));
};
function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalAgentDetailView />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  h.range = null;
  h.agent = { data: { id: "ag1", name: "Security Reviewer", provider: "openai", model: "gpt-4.1", system_prompt: "p", strategy: "single-pass" }, isLoading: false, isError: false, error: null };
  h.runs = [run({ id: "r2", agent_version: 2, recall: 0.75, precision: 0.7 }), run({ id: "r1", agent_version: 1, recall: 0.5, precision: 0.8 })];
  h.cases = [{}, {}, {}];
  h.details = { r1: detail("r1", 1), r2: detail("r2", 2) };
});
afterEach(cleanup);

describe("EvalAgentDetailView", () => {
  it("AC-75: crumb, back link, title, model chip, subtitle, Run eval", () => {
    renderView();
    expect(h.crumb).toHaveBeenCalledWith([{ label: "Skills Lab" }, { label: "Eval Dashboard", href: "/eval" }, { label: "Security Reviewer" }]);
    expect(screen.getByRole("link", { name: /All agents/ })).toHaveAttribute("href", "/eval");
    expect(screen.getByRole("heading", { name: /Security Reviewer/ })).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("Regression harness · 2 runs in range on 3 cases")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(h.start).toHaveBeenCalled();
  });

  it("EC-13: Run eval is disabled with a tooltip when the agent has no cases", () => {
    h.cases = [];
    renderView();
    const btn = screen.getByRole("button", { name: "Run eval" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Add an eval case first");
  });

  it("opening Compare refetches the agent so the Promote gate sees its live config", () => {
    renderView();
    expect(h.refetch).not.toHaveBeenCalled();
    openCompare();
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it("NFR-7: the legend label comes from the messages", () => {
    renderView();
    expect(screen.getByLabelText("Legend")).toBeInTheDocument();
  });

  it("AC-75: the agent dropdown opens the chosen agent's page", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Security Reviewer/ }));
    fireEvent.click(screen.getByText("Style Reviewer"));
    expect(h.push).toHaveBeenCalledWith("/eval/ag2?range=30d");
  });

  it("AC-76: default range is 30d; an invalid ?range=xx renders as 30d and queries 30d", () => {
    h.range = "xx";
    renderView();
    expect(h.crumb).toHaveBeenCalledWith({ range: "30d" });
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("AC-76: choosing a range replaces the URL and queries with it", () => {
    h.range = "7d";
    renderView();
    expect(h.crumb).toHaveBeenCalledWith({ range: "7d" });
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(h.replace).toHaveBeenCalledWith("/eval/ag1?range=all");
  });

  it("AC-77: tiles show latest percent, delta against the previous done run, — for none", () => {
    renderView();
    expect(screen.getAllByText("75%")[0]).toBeInTheDocument(); // tile first, then the history row
    expect(screen.getByText("▲ 25pt")).toBeInTheDocument();
    expect(screen.getByText("▼ 10pt")).toBeInTheDocument();
    expect(screen.getAllByText("—")[0]).toBeInTheDocument();
  });

  it("EC-20: one done run -> values, no delta, no banner, chart still drawn", () => {
    h.runs = [run({ id: "r1", precision: 0.5 })];
    renderView();
    expect(screen.getAllByText("75%")[0]).toBeInTheDocument(); // tile first, then the history row
    expect(screen.queryByText(/pt$/)).toBeNull();
    expect(screen.queryByText(/dropped/)).toBeNull();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("AC-78: Metric trend chart: recall/precision/citation in time order, with legend", () => {
    renderView();
    expect(screen.getByText("Metric trend")).toBeInTheDocument();
    const series = JSON.parse(screen.getByTestId("chart").textContent!);
    expect(series[0]).toEqual(["Recall", [0.5, 0.75]]);
    expect(series[1]).toEqual(["Precision", [0.8, 0.7]]);
    expect(within(screen.getByLabelText("Legend")).getAllByText(/Recall|Precision|Citation/)).toHaveLength(3);
  });

  it("AC-79: regression banner appears when a metric dropped >= 1pt", () => {
    renderView();
    expect(screen.getByText("Precision dropped 10pt on v2 vs v1. Recall up 25pt.")).toBeInTheDocument();
  });

  it("AC-80: no runs in range -> text in place of chart and history", () => {
    h.runs = [];
    renderView();
    expect(screen.getByText("No eval runs in this range.")).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).toBeNull();
    expect(screen.queryByText("Run history")).toBeNull();
  });

  it("AC-61: history table gets the runs in range", () => {
    renderView();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("AC-81: unknown agent -> Agent not found with a link back", () => {
    h.agent = { data: undefined, isLoading: false, isError: true, error: new ApiError("nope", 404) };
    renderView();
    expect(screen.getByText("Agent not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Eval Dashboard" })).toHaveAttribute("href", "/eval");
  });

  it("C4: Compare opens the modal with the selected ids and closing removes it", () => {
    renderView();
    openCompare();
    expect(screen.getByText("Compare runs · v1 → v2")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(screen.queryByText("Compare runs · v1 → v2")).not.toBeInTheDocument();
  });
});
