import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";

const agent = (over: Partial<Agent>): Agent => ({
  id: "a1",
  name: "Security Reviewer",
  description: "d",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  system_prompt: "p",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
  skill_count: 0,
  ...over,
});

const AGENTS = [
  agent({ id: "a1", name: "Security Reviewer", skill_count: 4 }),
  agent({ id: "a2", name: "General Reviewer", skill_count: 1 }),
  agent({ id: "a3", name: "Blank Reviewer", skill_count: 0 }),
];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({ ShellCrumb: () => null }));
vi.mock("@/lib/api/agents", () => ({
  useAgents: () => ({ data: AGENTS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateAgent: () => ({ mutate: vi.fn() }),
  useDeleteAgent: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { AgentsListView } from "./AgentsListView";

afterEach(cleanup);

describe("AgentsListView", () => {
  it("shows how many skills each agent has attached on its tile", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
          <AgentsListView />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("4 skills")).toBeInTheDocument();
    expect(screen.getByText("1 skill")).toBeInTheDocument();
    expect(screen.getByText("0 skills")).toBeInTheDocument();
  });
});
