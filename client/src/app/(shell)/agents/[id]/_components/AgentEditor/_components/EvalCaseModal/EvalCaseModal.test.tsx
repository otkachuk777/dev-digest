import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../messages/en/eval.json";
import { ApiError } from "@/lib/api/client";

const h = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/api/eval", () => ({
  useCreateEvalCase: () => ({ mutateAsync: h.create }),
  useUpdateEvalCase: () => ({ mutateAsync: h.update }),
  useRunEvalCase: () => ({ mutate: h.run, isPending: false }),
}));

import { EvalCaseModal } from "./EvalCaseModal";

const DIFF = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +5,2 @@\n x\n+y";
const CASE: EvalCase = {
  id: "c1", agent_id: "ag1", name: "leak", expectation_type: "must_find",
  expected: [{ file: "a.ts", start_line: 5, end_line: 6, severity: "CRITICAL", category: "security", title: "Key" }],
  input_diff: DIFF, input_meta: { title: "T", body: "B" }, source_finding_id: "f1", source_decision: "accepted",
  last_result: { case_id: "c1", case_name: "leak", expectation_type: "must_find", status: "pass", expected_count: 1, matched_count: 1, findings: [], dropped_count: 0, error: null, duration_ms: 1800, cost_usd: 0.02, ran_at: "" },
  created_at: "",
};

function renderModal(c: EvalCase | null, onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalCaseModal agentId="ag1" agentName="Security Reviewer" evalCase={c} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  h.create.mockResolvedValue({ id: "new1" });
  h.update.mockResolvedValue({ id: "c1" });
});
afterEach(cleanup);

describe("EvalCaseModal", () => {
  it("AC-22: new case defaults", () => {
    renderModal(null);
    expect(screen.getByText("New eval case")).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer · simulate a PR and assert the expected output")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Must find" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("switch", { name: /Run on save/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run case" })).toBeDisabled();
  });

  it("AC-23/31/35: existing seeded case shows banner, subtitle, last result, read-only type", () => {
    renderModal(CASE);
    expect(screen.getByText("Eval case · leak")).toBeInTheDocument();
    expect(screen.getByText("Seeded from a accepted finding · assert the expected output")).toBeInTheDocument();
    expect(screen.getByText(/MUST find “Key” at a.ts:5-6/)).toBeInTheDocument();
    expect(screen.getByText("Last run passed")).toBeInTheDocument();
    expect(screen.getByText(/expected 1 finding, got 1 · 1.8s · \$0.02/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Must not flag" })).toBeNull();
  });

  it("design: the Diff tab previews the diff with per-line add / hunk styling (plain text)", () => {
    renderModal(CASE);
    expect(screen.queryByLabelText("Diff")).toBeNull(); // one view only: the textarea is hidden
    expect(screen.getByText("+y")).toHaveAttribute("data-line", "add");
    expect(screen.getByText("@@ -1,1 +5,2 @@")).toHaveAttribute("data-line", "hunk");
    expect(screen.getByText("--- a/a.ts")).toHaveAttribute("data-line", "ctx");
  });

  it("Edit diff swaps the preview for the textarea and Done swaps back", () => {
    renderModal(CASE);
    fireEvent.click(screen.getByRole("button", { name: "Edit diff" }));
    expect(screen.getByLabelText("Diff")).toBeInTheDocument();
    expect(screen.queryByText("+y")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByLabelText("Diff")).toBeNull();
    expect(screen.getByText("+y")).toBeInTheDocument();
  });

  it("a new case with an empty diff starts in edit mode", () => {
    renderModal(null);
    expect(screen.getByLabelText("Diff")).toBeInTheDocument();
  });

  it("AC-32: Run case is disabled with a tooltip while the form is dirty", () => {
    renderModal(CASE);
    const btn = screen.getByRole("button", { name: "Run case" });
    expect(btn).toBeEnabled();
    type("Name", "other");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Save the case first");
  });

  it("AC-25: invalid JSON shows the badge and disables Save", () => {
    renderModal(null);
    type("Expected output", "{");
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("AC-26: skeleton appends the first file and first new line of a 2-file diff", () => {
    renderModal(null);
    type("Diff", DIFF + "\ndiff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +90 @@\n+z");
    fireEvent.click(screen.getByRole("button", { name: "+ Finding skeleton" }));
    const v = (screen.getByLabelText("Expected output") as HTMLTextAreaElement).value;
    expect(JSON.parse(v)).toEqual([{ file: "a.ts", start_line: 5, end_line: 5 }]);
  });

  it("AC-24: Files tab lists paths and shows a file's part", () => {
    renderModal(CASE);
    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    expect(screen.getByRole("button", { name: "a.ts" })).toBeInTheDocument();
    expect(screen.getByText(/@@ -1,1 \+5,2 @@/)).toBeInTheDocument();
  });

  it("AC-29: saving a new case runs it when Run on save is on", async () => {
    const onClose = renderModal(null);
    type("Name", "n1");
    type("Diff", DIFF);
    type("Expected output", JSON.stringify([{ file: "a.ts", start_line: 5, end_line: 5 }]));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(h.create.mock.calls[0]![0]).toMatchObject({ name: "n1", expectation_type: "must_find" });
    expect(h.run).toHaveBeenCalledWith("new1");
  });

  it("AC-29: Run on save off does not run", async () => {
    const onClose = renderModal(CASE);
    fireEvent.click(screen.getByRole("switch", { name: /Run on save/ }));
    type("Name", "leak2");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(h.update.mock.calls[0]![0].input).not.toHaveProperty("expectation_type");
    expect(h.run).not.toHaveBeenCalled();
  });

  it("AC-27: empty name is rejected client-side under Name", () => {
    renderModal(null);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/Name is required/)).toBeInTheDocument();
    expect(h.create).not.toHaveBeenCalled();
  });

  it("AC-27 + amendment 4: server expected.0.start_line error renders under Expected output", async () => {
    h.update.mockRejectedValue(new ApiError("start_line must be >= 1", 400, "invalid_eval_case", { field: "expected.0.start_line" }));
    renderModal(CASE);
    type("Name", "leak2");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("start_line must be >= 1");
    expect(screen.getByLabelText("Expected output")).toHaveAttribute("aria-describedby", alert.id);
  });

  it("AC-28: duplicate name shows the inline text under Name", async () => {
    h.update.mockRejectedValue(new ApiError("dup", 409, "duplicate_case_name"));
    renderModal(CASE);
    type("Name", "dup");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("A case named dup already exists for this agent.")).toBeInTheDocument();
  });
});
