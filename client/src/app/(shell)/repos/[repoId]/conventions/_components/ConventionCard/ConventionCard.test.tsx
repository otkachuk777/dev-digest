import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const item: ConventionCandidate = {
  id: "c1",
  category: "style",
  rule: "Use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts",
  evidence_start: 23,
  evidence_end: 31,
  evidence_snippet: "const user = await db.users.find(id);",
  evidence_url: "https://github.com/acme/app/blob/abc123/src/api/users.ts#L23-L31",
  confidence: 0.91,
  accepted: false,
};

function setup(over: Partial<ConventionCandidate> = {}) {
  const handlers = { onToggleAccepted: vi.fn(), onReject: vi.fn(), onSaveRule: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard item={{ ...item, ...over }} {...handlers} />
    </NextIntlClientProvider>,
  );
  return handlers;
}

describe("ConventionCard", () => {
  it("links the evidence to the pinned GitHub blob", () => {
    setup();
    const link = screen.getByRole("link", { name: "src/api/users.ts:23-31" });
    expect(link).toHaveAttribute("href", item.evidence_url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("Accept / Accepted toggles acceptance", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(h.onToggleAccepted).toHaveBeenCalledWith(true);
    cleanup();
    const h2 = setup({ accepted: true });
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
    expect(h2.onToggleAccepted).toHaveBeenCalledWith(false);
  });

  it("Reject calls onReject", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(h.onReject).toHaveBeenCalledTimes(1);
  });

  it("Edit swaps the rule for an input in place and saves the new text", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const input = screen.getByLabelText("Convention rule");
    expect(input).toHaveValue(item.rule);
    fireEvent.change(input, { target: { value: "Prefer async/await" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(h.onSaveRule).toHaveBeenCalledWith("Prefer async/await");
    expect(screen.queryByLabelText("Convention rule")).toBeNull();
  });

  it("Cancel leaves the rule untouched", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Convention rule"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.onSaveRule).not.toHaveBeenCalled();
    expect(screen.getByText(item.rule)).toBeInTheDocument();
  });
});
