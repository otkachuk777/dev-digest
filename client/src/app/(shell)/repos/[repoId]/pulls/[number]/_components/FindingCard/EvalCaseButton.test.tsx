import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/eval.json";
import { ToastProvider } from "@/lib/toast";
import { EvalCaseButton } from "./EvalCaseButton";

const mutate = vi.fn();
let pending = false;
vi.mock("@/lib/api/eval", () => ({
  useCaseFromFinding: () => ({ mutate, isPending: pending }),
}));

afterEach(cleanup);
beforeEach(() => {
  mutate.mockReset();
  pending = false;
});

const F = { id: "f1", accepted_at: null, dismissed_at: null } as unknown as FindingRecord;

function setup(f: Partial<FindingRecord>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <ToastProvider>
        <EvalCaseButton f={{ ...F, ...f }} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}
const btn = () => screen.getByRole("button", { name: "Turn into eval case" });

describe("EvalCaseButton", () => {
  it("AC-1: accepted → enabled with the must-find tooltip", () => {
    setup({ accepted_at: "2026-01-01" });
    expect(btn()).toBeEnabled();
    expect(btn()).toHaveAttribute("title", "Create a 'must find' eval case from this finding");
  });

  it("AC-2: dismissed → enabled with the must-NOT-comment tooltip", () => {
    setup({ dismissed_at: "2026-01-01" });
    expect(btn()).toBeEnabled();
    expect(btn()).toHaveAttribute("title", "Create a 'must NOT comment' eval case from this dismissal");
  });

  it("AC-3: undecided → disabled with the decide-first tooltip", () => {
    setup({});
    expect(btn()).toBeDisabled();
    expect(btn()).toHaveAttribute("title", "Accept or dismiss this finding first");
  });

  it("EC-1: disabled while the request is pending", () => {
    pending = true;
    setup({ accepted_at: "2026-01-01" });
    expect(btn()).toBeDisabled();
  });

  it.each([
    [true, "Eval case created"],
    [false, "Eval case already exists"],
  ])("AC-9: created=%s → toast %s with the Evals-tab link", async (created, text) => {
    mutate.mockImplementation((_id, opts) => opts.onSuccess({ created, case: { agent_id: "a9" } }));
    setup({ accepted_at: "2026-01-01" });
    fireEvent.click(btn());
    expect(mutate.mock.calls[0]![0]).toBe("f1");
    await waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Open in Evals tab" })).toHaveAttribute("href", "/agents/a9?tab=evals");
  });
});
