import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../../messages/en/brief.json";

const rederiveMutate = vi.fn();
let intentData: PrIntentRecord | null | undefined;
let intentLoading = false;

vi.mock("@/lib/api/reviews", () => ({
  useIntent: () => ({ data: intentData, isLoading: intentLoading }),
  useRederiveIntent: () => ({ mutate: rederiveMutate, isPending: false }),
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  rederiveMutate.mockClear();
  intentData = undefined;
  intentLoading = false;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const INTENT: PrIntentRecord = {
  pr_id: "pr1",
  summary: "Adds rate limiting to the public API.",
  in_scope: ["Rate limiting middleware"],
  out_of_scope: ["Auth refactor"],
  head_sha: "abc1234def",
  model: "openrouter/deepseek/deepseek-v4-flash",
  confidence: "high",
  sources: [
    { kind: "description", ref: "pr-description", status: "used" },
    { kind: "issue", ref: "jira.example.com/browse/X-1", status: "unavailable" },
  ],
  missing_context: ["No spec doc linked"],
  created_at: "2026-06-01T00:00:00Z",
};

describe("IntentCard (smoke)", () => {
  it("empty state: shows a Derive intent CTA when no intent is stored", () => {
    intentData = null;
    renderWithIntl(<IntentCard prId="pr1" headSha="abc1234def" />);
    expect(screen.getByText("No intent derived yet for this PR.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /derive intent/i }));
    expect(rederiveMutate).toHaveBeenCalledTimes(1);
  });

  it("full card: summary, in/out of scope, sources (with unavailable), missing context, model line", () => {
    intentData = INTENT;
    renderWithIntl(<IntentCard prId="pr1" headSha="abc1234def" />);

    expect(screen.getByText(/Adds rate limiting to the public API\./)).toBeInTheDocument();
    expect(screen.getByText("Rate limiting middleware")).toBeInTheDocument();
    expect(screen.getByText("Auth refactor")).toBeInTheDocument();
    expect(screen.getByText(/jira\.example\.com\/browse\/X-1/)).toBeInTheDocument();
    expect(screen.getByText(/unavailable/)).toBeInTheDocument();
    expect(screen.getByText("No spec doc linked")).toBeInTheDocument();
    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(screen.getByText(/deepseek-v4-flash/)).toBeInTheDocument();
    // Not stale — head_sha matches the PR's current head.
    expect(screen.queryByText("stale")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /re-derive/i }));
    expect(rederiveMutate).toHaveBeenCalledTimes(1);
  });

  it("shows a stale badge when the PR's head has moved past the intent's head_sha", () => {
    intentData = INTENT;
    renderWithIntl(<IntentCard prId="pr1" headSha="def9999999" />);
    expect(screen.getByText("stale")).toBeInTheDocument();
  });

  it("shows a loading skeleton while fetching", () => {
    intentLoading = true;
    renderWithIntl(<IntentCard prId="pr1" headSha="abc1234def" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("No intent derived yet for this PR.")).not.toBeInTheDocument();
  });
});
