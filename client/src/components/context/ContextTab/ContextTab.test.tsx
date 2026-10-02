import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/context.json";

const setAgent = vi.fn();
const setSkill = vi.fn();
let listing: any;
let ctx: any;
let saveFailed = false;
let listingFailed = false;
let ownerFailed = false;

vi.mock("@/lib/api/context", () => ({
  useContextDocs: () => ({ data: listingFailed ? undefined : listing, isLoading: false, isError: listingFailed }),
  useContextDoc: (_r: string, path: string | null) => ({
    isError: false,
    data: path
      ? { path, type: "docs", tokens: 5, used_by_agents: 1, used_by_skills: 0, content: "# Hello\n\n![pic](https://evil.test/x.png)" }
      : undefined,
  }),
  useAgentContext: (id: string | null) => ({ data: id && !ownerFailed ? ctx : undefined, isLoading: false, isError: ownerFailed }),
  useSkillContext: (id: string | null) => ({ data: id && !ownerFailed ? ctx : undefined, isLoading: false, isError: ownerFailed }),
  useSetAgentContext: () => ({ mutate: setAgent, isError: saveFailed }),
  useSetSkillContext: () => ({ mutate: setSkill, isError: saveFailed }),
}));

import { ContextTab } from "./ContextTab";

const doc = (path: string, type: "specs" | "docs" | "insights", tokens = 10) => ({
  path,
  type,
  size: 1,
  tokens,
  used_by_agents: 0,
  used_by_skills: 0,
});
const row = (path: string, type: any, tokens = 10, status = "present") => ({ path, type, tokens, status });

function setup(props: Partial<React.ComponentProps<typeof ContextTab>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextTab owner={{ kind: "agent", id: "a1" }} repoId="r1" repoName="acme/payments-api" {...props} />
    </NextIntlClientProvider>,
  );
}

const rowFor = (path: string) =>
  screen.getAllByRole("listitem").find((li) => li.textContent?.includes(path))!;
const order = () =>
  screen
    .getAllByRole("listitem")
    .map((li) => /(?:specs|docs|insights)\/\w+\.md/.exec(li.textContent ?? "")?.[0]);

beforeEach(() => {
  saveFailed = false;
  listingFailed = false;
  ownerFailed = false;
  listing = {
    status: "ok",
    glob: "**",
    synced_at: null,
    total_tokens: 50,
    docs: [
      doc("specs/a.md", "specs", 10),
      doc("specs/b.md", "specs", 20),
      doc("docs/c.md", "docs", 30),
      doc("docs/d.md", "docs", 40),
      doc("insights/e.md", "insights", 50),
    ],
  };
  ctx = {
    repo_id: "r1",
    budget_tokens: 8000,
    attached: [row("docs/c.md", "docs", 30), row("specs/a.md", "specs", 10), row("specs/gone.md", null, 0, "not_found")],
    inherited: [
      { ...row("docs/d.md", "docs", 40), skill_id: "s1", skill_name: "Style" },
      { ...row("docs/c.md", "docs", 30), skill_id: "s1", skill_name: "Style" },
    ],
    total_tokens: 80,
    truncated_paths: ["docs/d.md"],
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ContextTab", () => {
  it("AC-15/20/23/24/26, EC-4: attached, then inherited via skill, then the rest; counts, tokens, budget", () => {
    setup();
    // a path attached to the agent and inherited from a skill is listed once
    expect(order()).toEqual(["docs/c.md", "specs/a.md", "specs/gone.md", "docs/d.md", "specs/b.md", "insights/e.md"]);
    expect(screen.getByRole("checkbox", { name: /specs\/b\.md/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("checkbox", { name: /docs\/c\.md/ })).toHaveAttribute("aria-checked", "true");
    expect(within(rowFor("specs/b.md")).getByText("specs")).toBeInTheDocument();
    expect(within(rowFor("specs/b.md")).getByText("20 tokens")).toBeInTheDocument();
    expect(within(rowFor("docs/d.md")).getByText("via Style")).toBeInTheDocument();
    expect(screen.getAllByText("via Style")).toHaveLength(1);
    expect(screen.getByText("3 of 5 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 80 tokens")).toBeInTheDocument();
    expect(screen.getByText(/Over the 8,000-token budget.*docs\/d\.md/)).toBeInTheDocument();
    expect(within(rowFor("specs/gone.md")).getByText("not found in acme/payments-api")).toBeInTheDocument();
  });

  it("AC-21/22/26: drag, move down, detach, attach send the whole ordered set", () => {
    setup();
    fireEvent.dragStart(rowFor("specs/a.md"));
    fireEvent.drop(rowFor("docs/c.md"));
    expect(setAgent).toHaveBeenLastCalledWith({
      id: "a1",
      repoId: "r1",
      paths: ["specs/a.md", "docs/c.md", "specs/gone.md"],
    });

    fireEvent.click(within(rowFor("docs/c.md")).getByRole("button", { name: "Move down" }));
    expect(setAgent).toHaveBeenLastCalledWith({
      id: "a1",
      repoId: "r1",
      paths: ["specs/a.md", "docs/c.md", "specs/gone.md"],
    });

    fireEvent.click(within(rowFor("specs/gone.md")).getByRole("button", { name: "Detach" }));
    expect(setAgent).toHaveBeenLastCalledWith({ id: "a1", repoId: "r1", paths: ["docs/c.md", "specs/a.md"] });

    fireEvent.click(screen.getByRole("checkbox", { name: /specs\/b\.md/ }));
    expect(setAgent).toHaveBeenLastCalledWith({
      id: "a1",
      repoId: "r1",
      paths: ["docs/c.md", "specs/a.md", "specs/gone.md", "specs/b.md"],
    });
  });

  it("skill owner writes through the skill mutation without inherited rows", () => {
    ctx = { ...ctx, inherited: undefined };
    setup({ owner: { kind: "skill", id: "k1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /specs\/b\.md/ }));
    expect(setSkill).toHaveBeenCalledWith(expect.objectContaining({ id: "k1", repoId: "r1" }));
    expect(setAgent).not.toHaveBeenCalled();
  });

  it("AC-27/NFR-5: Preview opens the drawer with toggle + markdown; focus moves in and returns", () => {
    setup();
    const preview = within(rowFor("specs/b.md")).getByRole("button", { name: /Preview/ });
    preview.focus();
    fireEvent.click(preview);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    expect(document.querySelector("img")).toBeNull();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Attached" }));
    expect(setAgent).toHaveBeenLastCalledWith(
      expect.objectContaining({ paths: expect.arrayContaining(["specs/b.md"]) }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(preview).toHaveFocus();
  });

  it("EC-3/EC-2/EC-15 and save error", () => {
    const { unmount } = setup();
    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "zzz" } });
    expect(screen.getByText("No documents match your filter.")).toBeInTheDocument();
    expect(screen.getByText("3 of 5 attached")).toBeInTheDocument();
    unmount();

    setup({ repoId: null });
    expect(screen.getByText("Select a repository")).toBeInTheDocument();
    cleanup();

    listing = { ...listing, docs: [] };
    setup();
    expect(screen.getByText("No documents found in this repository.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Project Context" })).toHaveAttribute("href", "/repos/r1/context");
    cleanup();

    saveFailed = true;
    listing = { ...listing, docs: [doc("specs/a.md", "specs")] };
    setup();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t save the attached documents");
  });

  it("inherited not-found row has no Detach action (would PUT an unlisted path)", () => {
    ctx = { ...ctx, inherited: [{ ...row("specs/inh-gone.md", null, 0, "not_found"), skill_id: "s1", skill_name: "Style" }] };
    setup();
    const li = rowFor("specs/inh-gone.md");
    expect(within(li).getByText("not found in acme/payments-api")).toBeInTheDocument();
    expect(within(li).getByText("via Style")).toBeInTheDocument();
    expect(within(li).queryByRole("button", { name: "Detach" })).toBeNull();
  });

  it("a failed listing or owner-context query shows an error, not the skeleton", () => {
    listingFailed = true;
    setup();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load documents");
    cleanup();
    listingFailed = false;
    ownerFailed = true;
    setup();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load documents");
  });
});
