import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadius, PrHistory } from "@devdigest/shared";
import messages from "../../../../../../../../../../../messages/en/blast.json";

let blastData: BlastRadius | undefined;
let blastLoading = false;
let blastError = false;
const usePriorPrsMock = vi.fn();

vi.mock("@/lib/api/blast", () => ({
  useBlastRadius: () => ({
    data: blastData,
    isLoading: blastLoading,
    isError: blastError,
    refetch: vi.fn(),
  }),
  usePriorPrs: (...args: unknown[]) => usePriorPrsMock(...args),
  blastKeys: { radius: (prId: string | null | undefined) => ["blast", prId] as const },
}));

const resyncMutate = vi.fn();
vi.mock("@/lib/api/repo-intel", () => ({
  useResyncRepoIntel: () => ({ mutate: resyncMutate, isPending: false }),
}));

import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(() => {
  cleanup();
  blastData = undefined;
  blastLoading = false;
  blastError = false;
  resyncMutate.mockClear();
  usePriorPrsMock.mockReset();
  usePriorPrsMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
});

function renderCard() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastRadiusCard prId="pr1" repoId="repo1" repoFullName="o/r" headSha="abc" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const FULL_BLAST: BlastRadius = {
  changed_symbols: [
    { name: "alpha", file: "src/alpha.ts", kind: "function" },
    { name: "beta", file: "src/beta.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "alpha",
      callers: [{ name: "handler", file: "src/api/public/index.ts", line: 23 }],
      endpoints_affected: ["GET /api/public/items"],
      crons_affected: ["reset-rate-buckets"],
    },
    {
      symbol: "beta",
      callers: [{ name: "other", file: "src/other.ts", line: 5 }],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: "2 symbols changed · 2 callers · 1 endpoint · 1 cron",
  degraded: false,
};

describe("BlastRadiusCard", () => {
  it("shows a loading skeleton (role=status, aria-busy)", () => {
    blastLoading = true;
    renderCard();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("renders stats, a caller link, endpoint/cron chips, symbol collapse, graph view and prior PRs", () => {
    blastData = FULL_BLAST;
    usePriorPrsMock.mockReturnValue({
      data: { history: [{ pr_number: 12, title: "Old PR", merged_at: "2026-01-01", author: "a", files_overlap: ["src/alpha.ts"], notes: "" }] } satisfies PrHistory,
      isLoading: false,
      isError: false,
    });
    renderCard();

    expect(screen.getByText(/2.*symbols/)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "src/api/public/index.ts:23" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/o/r/blob/abc/src/api/public/index.ts#L23",
    );
    expect(link).toHaveAttribute("target", "_blank");

    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();
    expect(screen.getByText("reset-rate-buckets")).toBeInTheDocument();

    // Collapse the "alpha" symbol — its caller link disappears.
    fireEvent.click(screen.getByRole("button", { name: "Toggle alpha" }));
    expect(screen.queryByRole("link", { name: "src/api/public/index.ts:23" })).not.toBeInTheDocument();

    // Switch to graph view.
    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();

    // Expand prior PRs.
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/i }));
    expect(usePriorPrsMock).toHaveBeenCalledWith("pr1", true);
    expect(screen.getByText("#12")).toBeInTheDocument();
  });

  it("shows the no-downstream text when there are no callers", () => {
    blastData = { ...FULL_BLAST, downstream: [], summary: "2 symbols changed · no downstream callers" };
    renderCard();
    expect(screen.getByText(/no downstream callers/i)).toBeInTheDocument();
  });

  it("shows the degraded badge and lets the user resync", () => {
    blastData = { ...FULL_BLAST, degraded: true, reason: "no_data" };
    renderCard();
    expect(screen.getByText("Index incomplete: no index data yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resync index" }));
    expect(resyncMutate).toHaveBeenCalledTimes(1);
  });
});
