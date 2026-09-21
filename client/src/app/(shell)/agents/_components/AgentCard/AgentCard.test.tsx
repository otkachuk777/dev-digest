import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
const deleteMutate = vi.fn();
vi.mock("@/lib/api/agents", () => ({
  useDeleteAgent: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { AgentCard } from "./AgentCard";

afterEach(() => {
  cleanup();
  deleteMutate.mockClear();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
  skill_count: 0,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, provider · model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("openai · gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("Delete opens a confirmation; only Delete in the modal removes the agent", () => {
    renderWithIntl(<AgentCard ag={AGENT} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    expect(screen.getByRole("dialog")).toHaveTextContent('Delete agent "Security Reviewer"?');
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("ag1", expect.any(Object));
  });
});
