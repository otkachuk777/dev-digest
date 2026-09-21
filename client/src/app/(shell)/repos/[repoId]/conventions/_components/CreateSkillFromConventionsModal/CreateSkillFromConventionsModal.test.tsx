import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/conventions.json";

const createSkill = vi.fn();
const attachSkill = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: createSkill, isPending: false }),
}));
vi.mock("@/lib/api/agents", () => ({
  useAgents: () => ({ data: [{ id: "agent-1", name: "General Reviewer" }] }),
  useAttachAgentSkill: () => ({ mutateAsync: attachSkill, isPending: false }),
}));

import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";

const conv = (over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: "1",
  category: "style",
  rule: "Use async/await instead of .then() chains",
  evidence_path: "src/a.ts",
  evidence_start: 2,
  evidence_end: 3,
  evidence_snippet: "const r = await f();",
  evidence_url: "https://github.com/o/r/blob/abc/src/a.ts#L2-L3",
  confidence: 0.9,
  accepted: true,
  ...over,
});

const onClose = vi.fn();
function setup(conventions = [conv()]) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CreateSkillFromConventionsModal conventions={conventions} repoName="quick-blog" onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  // braces matter: a returned mock would be run by vitest as the teardown
  createSkill.mockResolvedValue({ id: "skill-9" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateSkillFromConventionsModal", () => {
  it("explains it is built from the accepted conventions and pre-fills an editable draft", () => {
    setup([conv(), conv({ id: "2", rule: "Use named exports" })]);
    expect(screen.getByText("Create skill from conventions")).toBeInTheDocument();
    expect(document.body.textContent).toContain("Merged from 2 accepted conventions in quick-blog.");
    expect(screen.getByLabelText("Name")).toHaveValue("repo-conventions");
    expect(screen.getByLabelText("Description")).toHaveValue("2 house conventions extracted from quick-blog");
    const body = screen.getByDisplayValue(/# repo-conventions/) as HTMLTextAreaElement;
    expect(body.value).toContain("Use named exports");
  });

  it("creates the skill from the edited fields, marked as extracted", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "blog-rules" } });
    fireEvent.change(screen.getByDisplayValue(/# repo-conventions/), { target: { value: "# edited body" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    await waitFor(() => expect(createSkill).toHaveBeenCalledTimes(1));
    expect(createSkill).toHaveBeenCalledWith({
      name: "blog-rules",
      description: "1 house conventions extracted from quick-blog",
      type: "convention",
      body: "# edited body",
      source: "extracted",
      enabled: true,
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills/skill-9"));
    expect(attachSkill).not.toHaveBeenCalled();
  });

  it("attaches the new skill to the chosen agent", async () => {
    setup();
    // the agent picker is the second <select> (after Type)
    fireEvent.change(screen.getAllByRole("combobox")[1]!, { target: { value: "agent-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    await waitFor(() => expect(attachSkill).toHaveBeenCalledWith({ agentId: "agent-1", skillId: "skill-9" }));
  });

  it("will not submit an empty name and Cancel closes without saving", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(createSkill).not.toHaveBeenCalled();
  });
});
