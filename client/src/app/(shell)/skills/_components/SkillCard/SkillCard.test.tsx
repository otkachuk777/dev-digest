import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
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
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders the skill name, type chip and source label", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("shows a needs-vetting badge for a non-manual source", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, source: "community" }} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("shows the current version and how many agents use the skill", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, version: 3, agent_count: 2 }} />);
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
  });

  it("says so when no agent uses it, and pluralises one", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("No agents")).toBeInTheDocument();
    cleanup();
    renderWithIntl(<SkillCard skill={{ ...SKILL, agent_count: 1 }} />);
    expect(screen.getByText("1 agent")).toBeInTheDocument();
  });

  it("has a Delete button that does not open the card", () => {
    const onDelete = vi.fn();
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onDelete={onDelete} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
