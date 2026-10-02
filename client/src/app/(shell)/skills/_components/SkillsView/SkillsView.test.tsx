import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";

const deleteMutate = vi.fn();

let selectedId: string | undefined;
let tabParam = "";
vi.mock("next/navigation", () => ({
  useParams: () => (selectedId ? { id: selectedId } : {}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(tabParam ? `tab=${tabParam}` : ""),
}));
vi.mock("./_components/SkillEditor", () => ({ SkillEditor: (p: { tab: string }) => <div>active-tab:{p.tab}</div> }));

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "pr-quality-rubric",
    description: "Checks PR title and description quality",
    type: "rubric",
    source: "manual",
    body: "# Rule\nBe clear.",
    enabled: true,
    version: 1,
    agent_count: 0,
    evidence_files: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

// Mock the data hooks so the view renders without a network/query client.
vi.mock("@/lib/api/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkill: () => ({ data: selectedId ? SKILLS[0] : undefined, isLoading: false, isError: false, error: undefined, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { SkillsView } from "./SkillsView";

afterEach(() => {
  cleanup();
  deleteMutate.mockClear();
  selectedId = undefined;
  tabParam = "";
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillsView (smoke)", () => {
  it("renders the skill list and a select-a-skill prompt when nothing is selected", () => {
    renderWithIntl(<SkillsView />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
  });

  it("?tab=context selects the Context tab; an unknown tab falls back to config", () => {
    selectedId = "sk1";
    tabParam = "context";
    renderWithIntl(<SkillsView />);
    expect(screen.getByText("active-tab:context")).toBeInTheDocument();
    cleanup();
    tabParam = "nope";
    renderWithIntl(<SkillsView />);
    expect(screen.getByText("active-tab:config")).toBeInTheDocument();
  });

  it("Delete asks for confirmation first, then deletes; Cancel does not", () => {
    renderWithIntl(<SkillsView />);
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(screen.getByRole("dialog")).toHaveTextContent('Delete skill "pr-quality-rubric"?');
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("sk1", expect.any(Object));
  });
});
