import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase, EvalCaseResult, EvalRunRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../messages/en/eval.json";

const h = vi.hoisted(() => ({
  cases: [] as EvalCase[], runs: [] as EvalRunRecord[],
  start: vi.fn(), run: vi.fn(), del: vi.fn(), push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/lib/api/eval", () => ({
  useEvalCases: () => ({ data: h.cases, isLoading: false }),
  useEvalRuns: () => ({ data: h.runs }),
  useStartEvalRun: () => ({ mutate: h.start, isPending: false }),
  useRunEvalCase: () => ({ mutate: h.run, isPending: false, variables: undefined }),
  useDeleteEvalCase: () => ({ mutate: h.del, isPending: false }),
  useCreateEvalCase: () => ({ mutateAsync: vi.fn() }),
  useUpdateEvalCase: () => ({ mutateAsync: vi.fn() }),
}));

import { EvalsTab } from "./EvalsTab";

const res = (o: Partial<EvalCaseResult>): EvalCaseResult => ({
  case_id: "c", case_name: "n", expectation_type: "must_find", status: "pass", expected_count: 1, matched_count: 1,
  findings: [], dropped_count: 0, error: null, duration_ms: 1, cost_usd: null, ran_at: "", ...o,
});
const mk = (id: string, o: Partial<EvalCase>): EvalCase => ({
  id, agent_id: "ag1", name: id, expectation_type: "must_find",
  expected: [{ file: "a.ts", start_line: 3, end_line: 4, severity: "critical", category: "security" }],
  input_diff: "", input_meta: { title: "", body: "" }, source_finding_id: null, source_decision: null, last_result: null, created_at: "", ...o,
});
const run = (o: Partial<EvalRunRecord>): EvalRunRecord => ({
  id: "r", agent_id: "ag1", agent_version: 1, status: "done", error: null, started_at: "", finished_at: null,
  cases_done: 0, total: 4, passed: 3, errored: 0, recall: 0.75, precision: 0.5, citation_accuracy: null,
  cost_usd: null, duration_ms: null, ...o,
});

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalsTab agentId="ag1" agentName="Sec" />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  h.cases = [];
  h.runs = [];
});
afterEach(cleanup);

describe("EvalsTab", () => {
  it("AC-16: no done run shows the empty text", () => {
    renderTab();
    expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
  });

  it("AC-16: tiles show percents, deltas against the previous done run, and — for null", () => {
    h.runs = [run({ recall: 0.75, precision: 0.4 }), run({ id: "r0", recall: 0.5, precision: 0.5 })];
    renderTab();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("▲ 25pt")).toBeInTheDocument();
    expect(screen.getByText("▼ 10pt")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
  });

  it("AC-17/18: dashboard link and the scoring note", () => {
    renderTab();
    expect(screen.getByText(/Scoring is mechanical/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("View full dashboard →"));
    expect(h.push).toHaveBeenCalledWith("/eval/ag1");
  });

  it("AC-21/EC-13: empty state, Run all disabled with the tooltip", () => {
    renderTab();
    expect(screen.getByText(/No eval cases yet/)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Run all evals" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Add an eval case first");
    fireEvent.click(screen.getAllByRole("button", { name: "New eval case" })[1]!);
    expect(screen.getByText("New eval case", { selector: "h2, h3, [id]" })).toBeInTheDocument();
  });

  it("AC-19/20: badges and rows for each status and both types", () => {
    h.cases = [
      mk("p", { last_result: res({ status: "pass" }) }),
      mk("f", { last_result: res({ status: "fail", expected_count: 2, matched_count: 1 }) }),
      mk("e", { last_result: res({ status: "error", error: "timed out" }) }),
      mk("n", {}),
      mk("neg", { expectation_type: "must_not_flag", last_result: res({ status: "fail", matched_count: 1, expectation_type: "must_not_flag" }) }),
      mk("noSev", { expected: [{ file: "x.ts", start_line: 1, end_line: 2 }] }),
    ];
    renderTab();
    expect(screen.getByText("1 / 4 passing")).toBeInTheDocument();
    expect(screen.getByText("6 cases")).toBeInTheDocument();
    for (const [name, label] of [["Passed", "p"], ["Failed", "f"], ["Errored", "e"], ["Never run", "n"]] as const) {
      expect(screen.getAllByRole("img", { name }).length).toBeGreaterThan(0);
      expect(label).toBeTruthy();
    }
    expect(screen.getByText("expected 2 findings, got 1")).toBeInTheDocument();
    expect(screen.getByText("error: timed out")).toBeInTheDocument();
    expect(screen.getAllByText("never run").length).toBe(2);
    expect(screen.getByText("expected 0 findings, got 1")).toBeInTheDocument();
    expect(screen.getByText("assert empty")).toBeInTheDocument();
    expect(screen.getByText("x.ts:1-2")).toBeInTheDocument();
    expect(screen.getAllByText("CRITICAL · security").length).toBeGreaterThan(0);
    expect(screen.getAllByText("must not flag")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Run \S+$/ })).toHaveLength(6);
  });

  it("AC-20: row Run runs the case without opening the modal; Edit opens it", () => {
    h.cases = [mk("p", {})];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Run p" }));
    expect(h.run).toHaveBeenCalledWith("p");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit p" }));
    expect(screen.getByRole("dialog", { name: "Eval case · p" })).toBeInTheDocument();
  });

  it("AC-33: delete asks for confirmation first", () => {
    h.cases = [mk("p", {})];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Delete p" }));
    const dlg = screen.getByRole("dialog");
    expect(within(dlg).getByText("Delete eval case p? Past runs keep its results.")).toBeInTheDocument();
    expect(h.del).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole("button", { name: "Delete" }));
    expect(h.del.mock.calls[0]![0]).toBe("p");
  });

  it("AC-45: a running suite shows progress on the run button and disables it", () => {
    h.cases = [mk("p", {})];
    h.runs = [run({ status: "running", cases_done: 2, total: 5 })];
    renderTab();
    expect(screen.getByRole("button", { name: "Running… 2/5 cases" })).toBeDisabled();
  });

  it("Run all starts a suite run", () => {
    h.cases = [mk("p", {})];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    expect(h.start).toHaveBeenCalled();
  });
});
