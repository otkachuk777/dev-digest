import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/agents.json";

let tabParam = "context";
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ag1" }),
  useSearchParams: () => new URLSearchParams(`tab=${tabParam}`),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({ ShellCrumb: () => null }));
vi.mock("@/lib/api/agents", () => ({
  useAgents: () => ({ data: [] }),
  useAgent: () => ({
    data: { id: "ag1", name: "Security Reviewer", provider: "openai", model: "gpt-4.1", enabled: true },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateAgent: () => ({ mutate: vi.fn() }),
}));
vi.mock("../AgentEditor", () => ({ AgentEditor: (p: { tab: string }) => <div>active-tab:{p.tab}</div> }));

import { AgentEditorView } from "./AgentEditorView";

afterEach(cleanup);

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <AgentEditorView />
    </NextIntlClientProvider>,
  );
}

describe("AgentEditorView tab routing", () => {
  it("?tab=context selects the Context tab", () => {
    tabParam = "context";
    renderView();
    expect(screen.getByText("active-tab:context")).toBeInTheDocument();
  });

  it("an unknown tab falls back to config", () => {
    tabParam = "nope";
    renderView();
    expect(screen.getByText("active-tab:config")).toBeInTheDocument();
  });
});
