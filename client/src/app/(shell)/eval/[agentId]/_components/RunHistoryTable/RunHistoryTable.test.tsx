import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../../messages/en/eval.json";
import { formatWhen } from "@/lib/date";
import { RunHistoryTable } from "./RunHistoryTable";

const run = (o: Partial<EvalRunRecord>): EvalRunRecord => ({
  id: "r", agent_id: "ag1", agent_version: 1, status: "done", error: null, started_at: "2026-10-01T10:00:00Z", finished_at: null,
  cases_done: 4, total: 4, passed: 3, errored: 0, recall: 0.75, precision: 0.5, citation_accuracy: null, cost_usd: 0.0123, duration_ms: null, ...o,
});
const runs = [
  run({ id: "r3", agent_version: 3 }),
  run({ id: "r2", agent_version: 2, status: "failed", error: "provider outage" }),
  run({ id: "r1", agent_version: 1, started_at: "2026-09-30T10:00:00Z" }),
  run({ id: "r0", agent_version: 0 + 4 }),
];
const onCompare = vi.fn();
function renderTable(rs = runs) {
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <RunHistoryTable runs={rs} onCompare={onCompare} />
    </NextIntlClientProvider>,
  );
}
afterEach(() => { cleanup(); onCompare.mockClear(); });
const box = (v: number) => screen.getByRole("checkbox", { name: new RegExp(`^Select run v${v} `) });

describe("RunHistoryTable", () => {
  it("AC-58: the pass label adds the errored suffix only above 0", () => {
    renderTable([run({ id: "a", agent_version: 5, errored: 1 }), run({ id: "b", agent_version: 6 })]);
    expect(screen.getByText("3/4 · 1 errored")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
  });

  it("AC-61: columns and a row's version, date, percents, pass and cost", () => {
    renderTable([runs[0]!]);
    for (const c of ["Ran at", "Version", "Recall", "Precision", "Citation", "Pass", "Cost"]) expect(screen.getByText(c)).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText(formatWhen("2026-10-01T10:00:00Z"))).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
  });

  it("AC-61: shows at most 100 rows", () => {
    renderTable(Array.from({ length: 120 }, (_, i) => run({ id: `x${i}`, agent_version: i + 1 })));
    expect(screen.getAllByRole("checkbox")).toHaveLength(100);
  });

  it("AC-62: a failed run shows its reason and has no checkbox; label names version and date", () => {
    renderTable();
    expect(screen.getByText("failed: provider outage")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Select run v2 / })).toBeNull();
    expect(screen.getByRole("checkbox", { name: `Select run v1 ${formatWhen("2026-09-30T10:00:00Z")}` })).toBeInTheDocument();
  });

  it("AC-63: Compare is disabled with the hint until exactly two are selected", () => {
    renderTable();
    const btn = screen.getByRole("button", { name: "Compare" });
    expect(btn).toBeDisabled();
    expect(screen.getByText("Select two runs to compare")).toBeInTheDocument();
    fireEvent.click(box(3));
    expect(btn).toBeDisabled();
    expect(screen.getByText("Select two runs to compare")).toBeInTheDocument();
    fireEvent.click(box(1));
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onCompare).toHaveBeenCalledWith(["r3", "r1"]);
  });

  it("AC-63: a third selection drops the earlier of the two; unticking removes", () => {
    renderTable();
    fireEvent.click(box(3));
    fireEvent.click(box(1));
    fireEvent.click(box(4));
    expect(box(3)).not.toBeChecked();
    expect(box(1)).toBeChecked();
    expect(box(4)).toBeChecked();
    fireEvent.click(box(1));
    expect(screen.getByRole("button", { name: "Compare" })).toBeDisabled();
  });
});
