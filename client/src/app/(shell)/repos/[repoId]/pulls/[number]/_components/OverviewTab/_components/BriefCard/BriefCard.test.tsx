import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief, ReviewRecord } from "@devdigest/shared";
import brief from "../../../../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../../../../messages/en/prReview.json";
import { ApiError } from "@/lib/api/client";

let briefData: PrBrief | null | undefined;
let reviewsData: ReviewRecord[] | undefined;
let pending = false;
const mutate = vi.fn();
let hookOnError: ((e: unknown) => void) | undefined;
const rederive = vi.fn();
const notifyError = vi.fn();
const notifyInfo = vi.fn();

vi.mock("@/lib/api/brief", () => ({
  useBrief: () => ({ data: briefData, isLoading: false }),
  useGenerateBrief: (_id: unknown, onError?: (e: unknown) => void) => {
    hookOnError = onError;
    return { mutate, isPending: pending };
  },
}));
vi.mock("@/lib/api/reviews", () => ({
  usePrReviews: () => ({ data: reviewsData }),
  useRederiveIntent: () => ({ mutate: rederive, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({
  notify: { error: (m: string) => notifyError(m), info: (m: string) => notifyInfo(m) },
}));

import { BriefCard } from "./BriefCard";

const onOpenInDiff = vi.fn();

beforeEach(() => {
  briefData = null;
  reviewsData = [];
  pending = false;
});
afterEach(() => {
  cleanup();
  mutate.mockReset();
  rederive.mockReset();
  notifyError.mockReset();
  notifyInfo.mockReset();
  onOpenInDiff.mockReset();
});

function renderCard(headSha = "abc1234def") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
      <BriefCard
        prId="pr1"
        headSha={headSha}
        prFiles={["src/a.ts", "src/b.ts"]}
        onOpenInDiff={onOpenInDiff}
      />
    </NextIntlClientProvider>,
  );
}

const BRIEF: PrBrief = {
  summary: "Adds a refund service.",
  intent: null,
  blast: null,
  risks: {
    risks: [
      {
        kind: "security",
        title: "Auth surface touched",
        explanation: "Explains <b>x</b> in detail.",
        severity: "high",
        file_refs: ["src/a.ts:12-18", "src/b.ts"],
      },
    ],
  },
  review_focus: [
    { file: "src/a.ts", line: 12, reason: "secret in plaintext" },
    { file: "src/gone.ts", line: 3, reason: "left the PR" },
  ],
  head_sha: "abc1234def",
  generated_at: "2026-10-03T10:00:00.000Z",
  provider: "openrouter",
  model: "gemini-flash",
  llm_calls: 1,
  tokens_in: 8200,
  tokens_out: 1300,
  cost_usd: 0.014,
  duration_ms: 3000,
  missing: [],
  truncated: false,
  files_truncated: false,
  dropped_items: 0,
};

function review(over: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Sec",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 42,
    model: null,
    created_at: "2026-10-01T00:00:00Z",
    findings: [],
    ...over,
  } as ReviewRecord;
}

describe("BriefCard", () => {
  it("AC-1: empty state with a Generate brief button; AC-2: click sends one request", () => {
    renderCard();
    expect(screen.getByText("No brief yet")).toBeInTheDocument();
    expect(screen.getByText("Generate a Why + Risk brief for this PR.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("AC-2/3/EC-1: pending shows a skeleton and a disabled Generating… button", () => {
    pending = true;
    renderCard();
    const btn = screen.getByRole("button", { name: /Generating… 0s/ });
    expect(btn).toBeDisabled();
    expect(screen.getByRole("status", { name: "Generating… 0s" })).toHaveAttribute("aria-busy", "true");
    fireEvent.click(btn);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("AC-3: with a stored brief, Refresh is the disabled Generating… control", () => {
    briefData = BRIEF;
    pending = true;
    renderCard();
    expect(screen.getByRole("button", { name: /Generating… 0s/ })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Auth surface touched")).not.toBeInTheDocument();
  });

  it("AC-13/AC-4/AC-20: stored brief renders summary, risks, focus and sends no request", () => {
    briefData = BRIEF;
    renderCard();
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Adds a refund service.")).toBeInTheDocument();
    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("Review focus — read these first")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate the brief for this PR" })).toBeEnabled();
  });

  it("AC-5/NFR-6: risk chip has a severity text alternative and first ref in mono", () => {
    briefData = BRIEF;
    renderCard();
    expect(screen.getByRole("img", { name: "high severity" })).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:12-18")).toBeInTheDocument();
  });

  it("AC-7/NFR-6: expand control exposes aria-expanded and shows explanation (plain text) and all refs", () => {
    briefData = BRIEF;
    renderCard();
    const expand = screen.getByRole("button", { name: "Why this is a risk: Auth surface touched" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);
    expect(expand).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Explains <b>x</b> in detail.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src/b.ts" })).toBeInTheDocument();
  });

  it("AC-8/AC-9/EC-2: empty lists show their messages", () => {
    briefData = { ...BRIEF, risks: { risks: [] }, review_focus: [] };
    renderCard();
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
    expect(screen.getByText("No review focus items.")).toBeInTheDocument();
  });

  it("AC-6/AC-21: focus item is a named button; click opens the diff at file and line", () => {
    briefData = BRIEF;
    renderCard();
    expect(screen.getByText("— secret in plaintext")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open src/a.ts:12 in Files changed" }));
    expect(onOpenInDiff).toHaveBeenCalledWith("src/a.ts", 12);
  });

  it("AC-26/EC-3: a file that is not in the PR toasts and does not navigate", () => {
    briefData = BRIEF;
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Open src/gone.ts:3 in Files changed" }));
    expect(onOpenInDiff).not.toHaveBeenCalled();
    expect(notifyInfo).toHaveBeenCalledWith("File not in this PR's diff");
  });

  it("AC-25: risk title navigates to the first line of the first ref; a ref without line passes null", () => {
    briefData = BRIEF;
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Auth surface touched src\/a\.ts:12-18/ }));
    expect(onOpenInDiff).toHaveBeenLastCalledWith("src/a.ts", 12);
    fireEvent.click(screen.getByRole("button", { name: "Why this is a risk: Auth surface touched" }));
    fireEvent.click(screen.getByRole("button", { name: "src/b.ts" }));
    expect(onOpenInDiff).toHaveBeenLastCalledWith("src/b.ts", null);
  });

  it("AC-15/AC-16: stale badge shows; no request until Refresh is clicked", () => {
    briefData = BRIEF;
    renderCard("other999");
    expect(screen.getByText("PR changed since this brief")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate the brief for this PR" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("AC-15: no stale badge when head matches", () => {
    briefData = BRIEF;
    renderCard();
    expect(screen.queryByText("PR changed since this brief")).not.toBeInTheDocument();
  });

  it("AC-17: caption", () => {
    briefData = BRIEF;
    renderCard();
    expect(screen.getByText("Generated with gemini-flash · abc1234 · $0.014 · 8k→1.3k")).toBeInTheDocument();
  });

  it("AC-19: no review → neutral label and no score", () => {
    briefData = BRIEF;
    renderCard();
    expect(screen.getByText("No agent review yet")).toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
  });

  it("AC-18/EC-5: banner uses the newest review (verdict, counts, score)", () => {
    briefData = BRIEF;
    reviewsData = [
      review({ id: "old", verdict: "approve", score: 90, created_at: "2026-09-01T00:00:00Z" }),
      review({
        id: "new",
        verdict: "request_changes",
        score: 42,
        created_at: "2026-10-02T00:00:00Z",
        findings: [
          { severity: "CRITICAL", dismissed_at: null },
          { severity: "WARNING", dismissed_at: null },
        ] as ReviewRecord["findings"],
      }),
    ];
    renderCard();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    expect(screen.getByText(/2 findings · 1 blockers/)).toBeInTheDocument();
    expect(screen.queryByText("No agent review yet")).not.toBeInTheDocument();
  });

  it("AC-35: missing chips; Derive intent calls the existing derivation", () => {
    briefData = { ...BRIEF, missing: ["intent", "blast", "description", "issue"] };
    renderCard();
    expect(screen.getByText("Intent not derived")).toBeInTheDocument();
    expect(screen.getByText("Blast radius unavailable")).toBeInTheDocument();
    expect(screen.getByText("No PR description")).toBeInTheDocument();
    expect(screen.getByText("Linked issue unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Derive intent" }));
    expect(rederive).toHaveBeenCalledTimes(1);
  });

  it("AC-47: a failed generation keeps the view and toasts the server message", () => {
    briefData = BRIEF;
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate the brief for this PR" }));
    act(() => hookOnError!(new ApiError("Provider exploded", 502, "provider_error")));
    expect(notifyError).toHaveBeenCalledWith("Provider exploded");
    expect(screen.getByText("Adds a refund service.")).toBeInTheDocument();
  });

  it("EC-1: 409 brief_in_progress toasts its own copy; 429 too", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    act(() => hookOnError!(new ApiError("x", 409, "brief_in_progress")));
    expect(notifyError).toHaveBeenLastCalledWith("A brief is already being generated for this PR");
    act(() => hookOnError!(new ApiError("slow down", 429)));
    expect(notifyError).toHaveBeenLastCalledWith("Too many brief requests. Try again in a minute.");
    expect(screen.getByText("No brief yet")).toBeInTheDocument();
  });

  it("F4: the expanded risk resets when the brief is replaced (Refresh)", () => {
    briefData = BRIEF;
    const view = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Why this is a risk: Auth surface touched" }));
    expect(screen.getByText("Explains <b>x</b> in detail.")).toBeInTheDocument();
    briefData = {
      ...BRIEF,
      generated_at: "2026-10-03T11:00:00.000Z",
      risks: { risks: [{ ...BRIEF.risks.risks[0]!, title: "Other risk", explanation: "Other detail." }] },
    };
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
        <BriefCard prId="pr1" headSha="abc1234def" prFiles={[]} onOpenInDiff={onOpenInDiff} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("Other detail.")).not.toBeInTheDocument();
  });
});
