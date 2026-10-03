import { describe, it, expect, vi, afterEach, beforeEach, beforeAll } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Onboarding, OnboardingState, OnboardingGenerateResult } from "@devdigest/shared";
import onboarding from "../../../../../../../../messages/en/onboarding.json";
import common from "../../../../../../../../messages/en/common.json";

/* SPEC-02 client. The real data hooks + api client run against a mocked `fetch`, so responses are
   Zod-parsed exactly as in the app. Page chrome (crumb, repo context, toasts, mermaid) is mocked. */

const refresh = vi.fn();
const toasts: string[] = [];
const push = vi.fn();
const writeText = vi.fn();
const mermaidApi = {
  initialize: vi.fn(),
  parse: vi.fn(async () => true),
  render: vi.fn(async () => ({ svg: "<svg></svg>" })),
};

vi.mock("mermaid", () => ({ default: mermaidApi }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/app-shell", () => ({ ShellCrumb: () => null }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", name: "quick-blog", full_name: "acme/shop" } }),
}));
vi.mock("@/lib/api/repos", () => ({ useRefreshRepo: () => ({ mutate: refresh, isPending: false }) }));
vi.mock("@/lib/toast", () => {
  const t = (m: string) => {
    toasts.push(m);
  };
  return { useToast: () => ({ toast: t, success: t, error: t, info: t }) };
});

import { OnboardingView } from "./OnboardingView";

const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const baseTour = (over: Partial<Onboarding> = {}): Onboarding => ({
  repo_full_name: "acme/shop",
  commit_sha: "c0ffee",
  generated_at: ago(3),
  status: "full",
  skeleton_reason: null,
  notes: [],
  files_total: 1234,
  files_indexed: 1000,
  provider: "openrouter",
  model: "deepseek/x",
  llm_calls: 1,
  tokens_in: 1000,
  tokens_out: 234,
  cost_usd: 0.0123,
  duration_ms: 4200,
  dropped_items: 0,
  architecture: {
    body: "## Overview\n\nHello **world** <b>rawhtml</b><script>window.__pwn = 1</script>",
    diagram: "flowchart TD\nA-->B",
  },
  critical_paths: [
    { path: "src/core.ts", reason: "Imported by 12 indexed files" },
    { path: "src/db/client.ts", reason: "Imported by 7 indexed files" },
  ],
  how_to_run: [
    { command: "pnpm install", comment: "install deps", cwd: null },
    { command: "pnpm run dev", comment: null, cwd: "server" },
  ],
  reading_path: [
    { path: "src/index.ts", reason: "Start here", rank: 0.4, hotness: 0 },
    { path: "src/my file.ts", reason: "Second stop", rank: 0.3, hotness: 0.5 },
  ],
  first_tasks: [
    { title: "Add tests", scope_path: "src/tasks/a.ts", complexity: "Medium" },
    { title: "Fix typo", scope_path: "docs", complexity: "Low" },
    { title: "Refactor router", scope_path: "src/tasks/b.ts", complexity: "High" },
  ],
  ...over,
});
const skeletonTour = (over: Partial<Onboarding> = {}) =>
  baseTour({
    status: "skeleton",
    skeleton_reason: "timeout",
    llm_calls: 1,
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: null,
    architecture: { body: "- **Stack:** SKELETON-MARKER", diagram: null },
    how_to_run: [{ command: "pnpm install", comment: null, cwd: null }],
    first_tasks: [],
    ...over,
  });
const baseState = (over: Partial<OnboardingState> = {}): OnboardingState => ({
  clone_status: "ok",
  generating: false,
  current_commit_sha: "c0ffee",
  model: { provider: "openrouter", model: "deepseek/x" },
  tour: baseTour(),
  ...over,
});

/* ---- fetch mock ---- */
type Reply = { status?: number; body?: unknown; error?: { code: string } };
let getReply: () => Reply | Promise<Reply>;
let postReply: () => Reply | Promise<Reply>;
const calls: { method: string; url: string }[] = [];
const respond = async (r: Reply) =>
  new Response(JSON.stringify(r.error ? { error: r.error } : (r.body ?? {})), {
    status: r.status ?? 200,
    headers: { "content-type": "application/json" },
  });

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => {
  calls.length = 0;
  toasts.length = 0;
  getReply = () => ({ body: baseState() });
  postReply = () => ({ body: { tour: baseTour(), failed_attempt: null } satisfies OnboardingGenerateResult });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, url: String(url) });
      return respond(await (method === "POST" ? postReply() : getReply()));
    }),
  );
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  mermaidApi.parse.mockReset().mockResolvedValue(true);
  mermaidApi.render.mockReset().mockResolvedValue({ svg: "<svg></svg>" });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ onboarding, common }}>
        <OnboardingView repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}
const posts = () => calls.filter((c) => c.method === "POST");
const sectionHeaders = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"));
const TITLES = ["Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks"];
const sectionOf = (title: string) => sectionHeaders().find((h) => h.textContent?.includes(title))!.closest("section") ?? sectionHeaders().find((h) => h.textContent?.includes(title))!.parentElement!;

describe("OnboardingView — reading the tour", () => {
  it("AC-4: heading, header line and the five sections in order", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "Onboarding for quick-blog" })).toBeInTheDocument();
    expect(
      screen.getByText(/Generated from index of 1,234 files · 1,000 indexed · last refreshed 3 hours ago/),
    ).toBeInTheDocument();
    const headers = sectionHeaders();
    expect(headers).toHaveLength(5);
    headers.forEach((h, i) => expect(h.textContent).toContain(TITLES[i]));
  });

  it("NFR-7: the file count uses the ICU plural", async () => {
    getReply = () => ({ body: baseState({ tour: baseTour({ files_total: 1, files_indexed: 1 }) }) });
    mount();
    expect(await screen.findByText(/Generated from index of 1 file · 1 indexed/)).toBeInTheDocument();
  });

  it("AC-5: a title in 'On this page' scrolls to and focuses that section's header", async () => {
    mount();
    const label = await screen.findByText("On this page");
    const scope = label.closest("nav") ?? label.parentElement!;
    fireEvent.click(within(scope).getByText("First tasks"));
    const header = sectionHeaders()[4]!;
    const active = document.activeElement as HTMLElement;
    expect(active).not.toBe(document.body);
    expect(active === header || active.contains(header) || header.contains(active)).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("AC-6 / NFR-6: sections start expanded; headers are buttons that toggle aria-expanded and name the body they control", async () => {
    mount();
    await screen.findByRole("heading", { name: "Onboarding for quick-blog" });
    const headers = sectionHeaders();
    for (const h of headers) {
      expect(h.tagName).toBe("BUTTON");
      expect(h).toHaveAttribute("aria-expanded", "true");
      expect(document.getElementById(h.getAttribute("aria-controls")!)).not.toBeNull();
    }
    fireEvent.click(headers[4]!);
    expect(headers[4]).toHaveAttribute("aria-expanded", "false");
    const task = screen.queryByText("Add tests");
    if (task) expect(task).not.toBeVisible();
    fireEvent.click(headers[4]!);
    expect(headers[4]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Add tests")).toBeVisible();
  });

  it("AC-7: the overview is Markdown with raw HTML not rendered, followed by the diagram (AC-62 text alternative)", async () => {
    const { container } = mount();
    expect(await screen.findByText("world")).toContainHTML("world");
    expect(screen.getByText("world").tagName).toBe("STRONG");
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(await screen.findByRole("img", { name: "Architecture diagram" })).toBeInTheDocument();
    expect(mermaidApi.render).toHaveBeenCalledTimes(1);
  });

  it("AC-7: no diagram in the tour -> no diagram area", async () => {
    getReply = () => ({ body: baseState({ tour: baseTour({ architecture: { body: "Body only", diagram: null } }) }) });
    mount();
    await screen.findByText("Body only");
    expect(screen.queryByRole("img", { name: "Architecture diagram" })).toBeNull();
  });

  it("AC-8: an unrenderable diagram is hidden silently and the body stays", async () => {
    mermaidApi.parse.mockResolvedValue(false);
    mount();
    await screen.findByText("world");
    await waitFor(() => expect(mermaidApi.parse).toHaveBeenCalled());
    expect(screen.queryByRole("img", { name: "Architecture diagram" })).toBeNull();
    expect(screen.queryByText(/syntax|error|couldn.?t render/i)).toBeNull();
  });

  it("AC-9: critical path rows show the path in monospace, the reason and an Open button", async () => {
    mount();
    const sec = within(await waitFor(() => sectionOf("Critical paths")));
    const code = sec.getByText("src/core.ts");
    expect(code.closest("code") ?? (/mono/i.test(code.style.fontFamily) ? code : null)).not.toBeNull();
    expect(sec.getByText(/Imported by 12 indexed files/)).toBeInTheDocument();
    expect(sec.getAllByRole("button", { name: "Open" })).toHaveLength(2);
  });

  it("AC-10: How to run is a numbered list with comments, cwd labels and copy buttons", async () => {
    mount();
    const section = await waitFor(() => sectionOf("How to run locally"));
    const sec = within(section);
    expect(section.querySelector("ol")).not.toBeNull();
    expect(sec.getByText("pnpm install").closest("code")).not.toBeNull();
    expect(sec.getByText("install deps")).toBeInTheDocument();
    expect(sec.getByText("in server/")).toBeInTheDocument();
    expect(sec.queryAllByText(/^in /)).toHaveLength(1); // only the command that has a cwd
    expect(sec.getByRole("button", { name: "Copy command: pnpm install" })).toBeInTheDocument();
    expect(sec.getByRole("button", { name: "Copy command: pnpm run dev" })).toBeInTheDocument();
  });

  it("AC-11 / AC-55: reading path is a numbered list of GitHub links at the tour's commit, each segment encoded", async () => {
    mount();
    const section = await waitFor(() => sectionOf("Guided reading path"));
    const sec = within(section);
    expect(section.querySelector("ol")).not.toBeNull();
    const a = sec.getByRole("link", { name: "src/index.ts" });
    expect(a).toHaveAttribute("href", "https://github.com/acme/shop/blob/c0ffee/src/index.ts");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a.getAttribute("rel")).toMatch(/noopener/);
    expect(sec.getByRole("link", { name: "src/my file.ts" })).toHaveAttribute(
      "href",
      "https://github.com/acme/shop/blob/c0ffee/src/my%20file.ts",
    );
    expect(sec.getByText("Start here")).toBeInTheDocument();
  });

  it("AC-12: first tasks are cards with title, scope path and a complexity badge", async () => {
    mount();
    const sec = within(await waitFor(() => sectionOf("First tasks")));
    expect(sec.getByText("Add tests")).toBeInTheDocument();
    expect(sec.getByText("src/tasks/a.ts")).toBeInTheDocument();
    expect(sec.getByText("Medium complexity")).toBeInTheDocument();
    expect(sec.getByText("Low complexity")).toBeInTheDocument();
    expect(sec.getByText("High complexity")).toBeInTheDocument();
  });

  it("AC-14: an empty section says 'Nothing to show for this section'", async () => {
    getReply = () => ({ body: baseState({ tour: baseTour({ critical_paths: [] }) }) });
    mount();
    const sec = within(await waitFor(() => sectionOf("Critical paths")));
    expect(sec.getByText("Nothing to show for this section")).toBeInTheDocument();
  });

  it("AC-14: a skeleton tour's empty First tasks asks for the AI summary instead", async () => {
    getReply = () => ({ body: baseState({ tour: skeletonTour() }) });
    mount();
    const sec = within(await waitFor(() => sectionOf("First tasks")));
    expect(sec.getByText("First tasks need the AI summary — regenerate to try again")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to show for this section")).toBeNull();
  });
});

describe("OnboardingView — status banner (AC-48, NFR-7)", () => {
  it("full: calls, tokens and the verbatim cost", async () => {
    mount();
    expect(await screen.findByText("AI-generated · 1 LLM call · 1,234 tokens · $0.0123")).toBeInTheDocument();
  });

  it("partial: the same line plus one line per note", async () => {
    getReply = () => ({ body: baseState({ tour: baseTour({ status: "partial", notes: ["index_partial", "files_bounded", "hotness_unavailable"] }) }) });
    mount();
    expect(await screen.findByText(/AI-generated · 1 LLM call/)).toBeInTheDocument();
    expect(screen.getByText("Index is partial")).toBeInTheDocument();
    expect(screen.getByText("Only 1,000 source files were indexed")).toBeInTheDocument();
    expect(screen.getByText("Reading path ranked by structure only")).toBeInTheDocument();
  });

  it("a missing cost prints a dash", async () => {
    getReply = () => ({ body: baseState({ tour: baseTour({ cost_usd: null, tokens_in: 4, tokens_out: 6 }) }) });
    mount();
    expect(await screen.findByText("AI-generated · 1 LLM call · 10 tokens · —")).toBeInTheDocument();
  });

  it.each([
    ["timeout", "the AI call took longer than 2 minutes"],
    ["rate_limited", "the AI provider is rate-limiting requests"],
    ["provider_error", "the AI provider returned an error"],
    ["invalid_output", "the AI answer could not be read"],
    ["no_api_key", "no API key for openrouter — add one in Settings → API Keys"],
  ] as const)("skeleton (%s) names the reason and every note", async (reason, text) => {
    getReply = () => ({ body: baseState({ tour: skeletonTour({ skeleton_reason: reason, notes: ["index_degraded", "graph_unavailable"] }) }) });
    mount();
    expect(await screen.findByText(`Skeleton — AI summary unavailable: ${text}`)).toBeInTheDocument();
    expect(screen.getByText("Index unavailable")).toBeInTheDocument();
    expect(screen.getByText("Reading path is approximate — import graph unavailable")).toBeInTheDocument();
  });
});

describe("OnboardingView — empty and unavailable states", () => {
  it("AC-13 / EC-3: no stored tour -> empty state naming the sections and the call cost, with a Generate CTA", async () => {
    getReply = () => ({ body: baseState({ tour: null }) });
    mount();
    expect(await screen.findAllByText("Generate onboarding tour")).not.toHaveLength(0);
    expect(
      screen.getByText("Builds five sections from the repository index: Architecture overview, Critical paths, How to run locally, Guided reading path and First tasks."),
    ).toBeInTheDocument();
    expect(screen.getByText("One AI call to openrouter/deepseek/x · up to 12,000 input tokens · up to 2 minutes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate onboarding tour" })).toBeEnabled();
  });

  it("AC-23: no clone -> 'Repo not cloned yet' with Sync repository, which refreshes the repo; no Generate CTA", async () => {
    getReply = () => ({ body: baseState({ clone_status: "no_clone", tour: null }) });
    mount();
    expect(await screen.findByText("Repo not cloned yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate onboarding tour" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sync repository" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0]![0]).toBe("r1");
  });

  it("EC-17: the repo is not in the workspace (404) -> the repo-not-found state", async () => {
    getReply = () => ({ status: 404, error: { code: "not_found" } });
    mount();
    expect(await screen.findByText("No repo selected")).toBeInTheDocument();
  });

  it("another load failure -> the load error", async () => {
    getReply = () => ({ status: 500, error: { code: "internal" } });
    mount();
    expect(await screen.findByText("Couldn’t load the onboarding tour")).toBeInTheDocument();
  });

  it("AC-21: 'Repo changed since this tour' only when the current commit differs", async () => {
    getReply = () => ({ body: baseState({ current_commit_sha: "newsha" }) });
    mount();
    expect(await screen.findByText("Repo changed since this tour")).toBeInTheDocument();
    cleanup();
    getReply = () => ({ body: baseState({ current_commit_sha: "c0ffee" }) });
    mount();
    await screen.findByRole("heading", { name: "Onboarding for quick-blog" });
    expect(screen.queryByText("Repo changed since this tour")).toBeNull();
    cleanup();
    getReply = () => ({ body: baseState({ current_commit_sha: null }) });
    mount();
    await screen.findByRole("heading", { name: "Onboarding for quick-blog" });
    expect(screen.queryByText("Repo changed since this tour")).toBeNull();
  });
});

describe("OnboardingView — generating (AC-15, AC-16, AC-18, EC-1, EC-2)", () => {
  function deferredPost() {
    let resolve!: (r: Reply) => void;
    const p = new Promise<Reply>((r) => (resolve = r));
    postReply = () => p;
    return resolve;
  }

  it("AC-15/16/18: one request, five placeholders, both buttons disabled with a live counter, then the new tour without reload", async () => {
    const resolve = deferredPost();
    const { container } = mount();
    const regen = await screen.findByRole("button", { name: "Regenerate" });
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"], shouldAdvanceTime: true });
    fireEvent.click(regen);
    fireEvent.click(regen); // a double click must not send a second request
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.url).toContain("/repos/r1/onboarding/generate");
    const busy = await screen.findByRole("button", { name: /Generating… \d+s/ });
    expect(busy).toBeDisabled();
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(5);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("button", { name: "Generating… 3s" })).toBeDisabled();
    expect(posts()).toHaveLength(1);

    resolve({ body: { tour: baseTour({ architecture: { body: "BRAND NEW BODY", diagram: null } }), failed_attempt: null } });
    expect(await screen.findByText("BRAND NEW BODY")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1); // rendered from the response, not a reload
  });

  it("AC-15/18: Generate from the empty state sends one request and renders the tour", async () => {
    getReply = () => ({ body: baseState({ tour: null }) });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Generate onboarding tour" }));
    expect(await screen.findByRole("heading", { name: "Onboarding for quick-blog" })).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    expect(sectionHeaders()).toHaveLength(5);
  });

  it("EC-1: 409 generation_in_progress -> the in-progress message and the current view is kept", async () => {
    postReply = () => ({ status: 409, error: { code: "generation_in_progress" } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("A tour is already being generated for this repository")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Onboarding for quick-blog" })).toBeInTheDocument();
    expect(sectionHeaders()).toHaveLength(5);
  });

  it("409 no_clone -> the state is refetched and shows 'Repo not cloned yet'", async () => {
    postReply = () => ({ status: 409, error: { code: "no_clone" } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    getReply = () => ({ body: baseState({ clone_status: "no_clone", tour: null }) });
    expect(await screen.findByText("Repo not cloned yet")).toBeInTheDocument();
  });

  it("EC-2: 404 on generate -> the repo-not-found state", async () => {
    postReply = () => ({ status: 404, error: { code: "not_found" } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("No repo selected")).toBeInTheDocument();
  });
});

describe("OnboardingView — failed regeneration (AC-45, AC-46)", () => {
  const prev = () => baseTour({ architecture: { body: "PREVIOUS BODY", diagram: null } });
  beforeEach(() => {
    getReply = () => ({ body: baseState({ tour: prev() }) });
    postReply = () => ({ body: { tour: prev(), failed_attempt: { reason: "timeout", skeleton: skeletonTour() } } });
  });

  it("AC-45: shows the notice with the reason above the kept tour, and a 'Show skeleton instead' action", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("Regeneration failed: the AI call took longer than 2 minutes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show skeleton instead" })).toBeInTheDocument();
    expect(screen.getByText("PREVIOUS BODY")).toBeInTheDocument();
  });

  it("AC-46: the skeleton replaces the view, is not stored, and a reload shows the stored tour again", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    fireEvent.click(await screen.findByRole("button", { name: "Show skeleton instead" }));
    expect(await screen.findByText(/SKELETON-MARKER/)).toBeInTheDocument();
    expect(screen.queryByText("PREVIOUS BODY")).toBeNull();
    expect(posts()).toHaveLength(1); // nothing was sent to store it
    cleanup();
    mount(); // "reload": fresh query client, server still holds the previous tour
    expect(await screen.findByText("PREVIOUS BODY")).toBeInTheDocument();
    expect(screen.queryByText(/SKELETON-MARKER/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Show skeleton instead" })).toBeNull();
  });
});

describe("OnboardingView — copy and open (AC-50…AC-55, EC-18, NFR-6)", () => {
  it("AC-50 / NFR-6: copying a command writes exactly its text, shows Copied for 2 s and announces it politely", async () => {
    const { container } = mount();
    const btn = await screen.findByRole("button", { name: "Copy command: pnpm run dev" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.click(btn);
    await act(async () => {
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("pnpm run dev");
    expect(screen.getAllByText("Copied").length).toBeGreaterThan(0);
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain("Copied");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryAllByText("Copied")).toHaveLength(0);
  });

  it("AC-54 / EC-18: a blocked clipboard shows the error toast and no Copied", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Copy command: pnpm install" }));
    await waitFor(() => expect(toasts).toContain("Couldn't copy — clipboard access was blocked"));
    expect(screen.queryAllByText("Copied")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Copy as Markdown" }));
    await waitFor(() => expect(toasts.filter((m) => m.startsWith("Couldn't copy"))).toHaveLength(2));
  });

  it("AC-51/AC-52: 'Copy as Markdown' copies the displayed tour and toasts", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Copy as Markdown" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const md = writeText.mock.calls[0]![0] as string;
    expect(md.startsWith("# Onboarding for acme/shop")).toBe(true);
    expect(md).toContain("## Critical paths");
    expect(md).toContain("`src/core.ts` — Imported by 12 indexed files");
    await waitFor(() => expect(toasts).toContain("Tour copied as Markdown"));
  });

  it("AC-52: after 'Show skeleton instead' the copy is the displayed skeleton", async () => {
    getReply = () => ({ body: baseState() });
    postReply = () => ({ body: { tour: baseTour(), failed_attempt: { reason: "timeout", skeleton: skeletonTour() } } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    fireEvent.click(await screen.findByRole("button", { name: "Show skeleton instead" }));
    await screen.findByText(/SKELETON-MARKER/);
    fireEvent.click(screen.getByRole("button", { name: "Copy as Markdown" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]![0]).toContain("SKELETON-MARKER");
  });

  it("AC-55: Open launches the GitHub blob URL at the tour's commit in a tab without opener access", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    mount();
    const section = await waitFor(() => sectionOf("Critical paths"));
    fireEvent.click(within(section).getAllByRole("button", { name: "Open" })[0]!);
    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0]!;
    expect(url).toBe("https://github.com/acme/shop/blob/c0ffee/src/core.ts");
    expect(target).toBe("_blank");
    expect(String(features)).toMatch(/noopener/);
  });
});
