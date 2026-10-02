import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDocFile, ContextListing } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/context.json";

const resync = vi.fn();
const invalidate = vi.fn();
let listing: ContextListing;
let docFile: { data?: ContextDocFile; isError: boolean };
let updatedAt = "t0";

vi.mock("@tanstack/react-query", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: invalidate }),
}));
vi.mock("@/lib/api/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/context")>()),
  useContextDocs: () => ({ data: listing, isLoading: false, isError: false }),
  useContextDoc: (_r: string, path: string | null) => (path ? docFile : { isError: false }),
}));
vi.mock("@/lib/api/repo-intel", () => ({
  useResyncRepoIntel: () => ({ mutate: resync, isPending: false }),
  useRepoIntelStatus: () => ({ data: { updatedAt } }),
}));

import { ProjectContextView } from "./ProjectContextView";

const doc = (path: string, type: "specs" | "docs" | "insights", tokens = 10) => ({
  path,
  type,
  size: 1,
  tokens,
  used_by_agents: 0,
  used_by_skills: 0,
});

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

function setup() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  updatedAt = "t0";
  listing = {
    status: "ok",
    glob: "**/{specs,docs,insights}/**/*.md",
    synced_at: hoursAgo(3),
    total_tokens: 30,
    docs: [doc("specs/a.md", "specs", 10), doc("docs/guide.md", "docs", 20)],
  };
  docFile = {
    isError: false,
    data: {
      path: "specs/a.md",
      type: "specs",
      tokens: 10,
      used_by_agents: 1,
      used_by_skills: 2,
      content: "# Title\n\n![pic](https://evil.test/x.png)\n",
    },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("ProjectContextView", () => {
  it("AC-4: lists docs grouped by type with path and tokens", () => {
    setup();
    expect(screen.getByText("Specs")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();
    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(screen.getByText("20 tokens")).toBeInTheDocument();
  });

  it("AC-5: filters by case-insensitive path substring", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "GUIDE" } });
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
    expect(screen.queryByText("specs/a.md")).toBeNull();
  });

  it("AC-6 / AC-7: selecting a doc shows the preview, used-by, and no remote image", () => {
    const { container } = setup();
    fireEvent.click(screen.getByText("specs/a.md"));
    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("Used by 1 agent · 2 skills")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("doc 404 shows the not-found message", () => {
    docFile = { isError: true };
    setup();
    fireEvent.click(screen.getByText("specs/a.md"));
    expect(screen.getByText("Document not found — refresh the list")).toBeInTheDocument();
  });

  it("AC-8: footer shows file count, tokens and relative sync time", () => {
    setup();
    expect(screen.getByText("Indexed: 2 files · 30 tokens total · last 3h")).toBeInTheDocument();
  });

  it("formats large token totals with a thousands separator", () => {
    listing = { ...listing, total_tokens: 103442 };
    setup();
    expect(screen.getByText(/103,442 tokens total/)).toBeInTheDocument();
  });

  it("AC-9: Refresh resyncs and re-lists once updatedAt advances", () => {
    const { rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(resync).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
    updatedAt = "t1";
    rerender(
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ProjectContextView repoId="r1" />
      </NextIntlClientProvider>,
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["context", "r1"] });
  });

  it("EC-17: Refresh gives up and re-lists after 60 s without progress", () => {
    vi.useFakeTimers();
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(invalidate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["context", "r1"] });
  });

  it("AC-10: empty listing names the glob", () => {
    listing = { ...listing, docs: [], total_tokens: 0 };
    setup();
    expect(screen.getByText("No documents yet")).toBeInTheDocument();
    expect(screen.getByText(/\*\*\/\{specs,docs,insights\}\/\*\*\/\*\.md/)).toBeInTheDocument();
  });

  it("EC-1: no_clone shows the not-cloned message", () => {
    listing = { ...listing, status: "no_clone", docs: [], synced_at: null };
    setup();
    expect(within(document.body).getByText(/has not been cloned yet/)).toBeInTheDocument();
  });
});
