import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalDashboard, EvalRunRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../messages/en/eval.json";
import { formatWhen } from "@/lib/date";

const h = vi.hoisted(() => ({
  data: undefined as unknown, isLoading: false, isError: false,
  runAll: vi.fn(), crumb: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock("@/components/app-shell", () => ({ ShellCrumb: (p: { items: unknown }) => { h.crumb(p.items); return null; } }));
vi.mock("@/lib/toast", () => ({ notify: { success: h.success, error: h.error } }));
vi.mock("@/lib/api/eval", () => ({
  useEvalDashboard: () => ({ data: h.data, isLoading: h.isLoading, isError: h.isError, refetch: vi.fn() }),
  useRunAllEvals: () => ({ mutate: h.runAll, isPending: false }),
}));

import { EvalDashboardView } from "./EvalDashboardView";

const run = (o: Partial<EvalRunRecord>): EvalRunRecord => ({
  id: "r", agent_id: "ag1", agent_version: 3, status: "done", error: null, started_at: "2026-10-01T10:00:00Z", finished_at: null,
  cases_done: 0, total: 4, passed: 3, errored: 0, recall: 0.75, precision: 0.5, citation_accuracy: null, cost_usd: null, duration_ms: null, ...o,
});
const dash = (o: Partial<EvalDashboard>): EvalDashboard => ({
  agents: [
    { agent_id: "ag1", name: "Security Reviewer", model: "gpt-4.1", enabled: true, case_count: 4, running: false, latest: run({}), recall_trend: [0.5, 0.75] },
    { agent_id: "ag2", name: "Style Reviewer", model: "gpt-4.1-mini", enabled: true, case_count: 0, running: false, latest: null, recall_trend: [] },
  ],
  recent_runs: [{ ...run({ id: "r9" }), agent_name: "Security Reviewer" }],
  ...o,
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalDashboardView />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => { vi.clearAllMocks(); h.data = dash({}); h.isLoading = false; h.isError = false; });
afterEach(cleanup);

describe("EvalDashboardView", () => {
  it("AC-72: title, subtitle, crumb, Run all agents", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Eval Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Regression harness across all reviewer agents · pick an agent to see its runs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all agents" })).toBeInTheDocument();
    expect(h.crumb).toHaveBeenCalledWith([{ label: "Skills Lab" }, { label: "Eval Dashboard" }]);
  });

  it("AC-72: agent rows are links with model chip, last-run line, percents; no-run agent says so", () => {
    renderView();
    const row = screen.getAllByRole("link", { name: /Security Reviewer/ })[0]!;
    expect(row).toHaveAttribute("href", "/eval/ag1");
    expect(within(row).getByText("gpt-4.1")).toBeInTheDocument();
    expect(within(row).getByText(`Last run v3 · ${formatWhen("2026-10-01T10:00:00Z")} · 3/4 pass`)).toBeInTheDocument();
    expect(within(row).getByText("75%")).toBeInTheDocument();
    expect(within(row).getByText("50%")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument();
    const none = screen.getByRole("link", { name: /Style Reviewer/ });
    expect(none).toHaveAttribute("href", "/eval/ag2");
    expect(within(none).getByText("No eval runs yet")).toBeInTheDocument();
  });

  it("AC-73: recent table rows link to the agent's detail page", () => {
    renderView();
    expect(screen.getByText("Recent eval runs · all agents")).toBeInTheDocument();
    const rows = screen.getAllByRole("link", { name: /Security Reviewer/ });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveAttribute("href", "/eval/ag1");
    expect(within(rows[1]!).getByText("v3")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("3/4")).toBeInTheDocument();
  });

  it("AC-74: no done run anywhere -> empty text in place of the recent table", () => {
    h.data = dash({ recent_runs: [], agents: [{ agent_id: "ag2", name: "Style Reviewer", model: "m", enabled: true, case_count: 0, running: false, latest: null, recall_trend: [] }] });
    renderView();
    expect(screen.getByText("No eval runs yet. Turn findings into eval cases from a PR, then run evals.")).toBeInTheDocument();
    expect(screen.queryByText("Recent eval runs · all agents")).toBeNull();
  });

  it("AC-48/EC-12: Run all agents toasts the started and skipped counts", () => {
    h.runAll.mockImplementation((_v: unknown, o: { onSuccess: (r: unknown) => void }) => o.onSuccess({ started: [run({})], skipped: [{}, {}] }));
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    expect(h.success).toHaveBeenCalledWith("Started 1 eval run · skipped 2");
    h.runAll.mockImplementation((_v: unknown, o: { onSuccess: (r: unknown) => void }) => o.onSuccess({ started: [], skipped: [{}] }));
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    expect(h.success).toHaveBeenLastCalledWith("Started 0 eval runs · skipped 1");
  });

  it("load failure shows an error state", () => {
    h.isError = true; h.data = undefined;
    renderView();
    expect(screen.getByText("Could not load the eval dashboard")).toBeInTheDocument();
  });
});
