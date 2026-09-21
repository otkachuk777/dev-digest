import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

const trace = (skills: string | null) =>
  RunTrace.parse({
    config: { agent: "Test Quality Reviewer", model: "m", provider: "openrouter" },
    stats: { duration_ms: 1000, tokens_in: 10, tokens_out: 5, cost_usd: 0, findings: 0, grounding: "0/0" },
    prompt_assembly: { system: "SYSTEM PROMPT ".repeat(50), skills, user: "USER DIFF" },
    tool_calls: [],
    raw_output: "{}",
    memory_pulled: [],
    specs_read: [],
    log: [],
  });

function setup(skills: string | null) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <TraceBody trace={trace(skills)} findings={[]} />
    </NextIntlClientProvider>,
  );
  // "Prompt assembly" is collapsed by default
  fireEvent.click(screen.getByText("Prompt assembly"));
}

describe("TraceBody — skills block", () => {
  it("shows a separate skills block with the token count of the skills text only", () => {
    setup("x".repeat(400)); // 400 chars → ~100 tokens, while the system block is far bigger
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
    expect(screen.getByText("~100 tokens")).toBeInTheDocument();
    expect(screen.getAllByText(/tokens$/).filter((el) => el.textContent?.startsWith("~"))).toHaveLength(1);
  });

  it("has no skills block at all when no skill reached the prompt", () => {
    setup(null);
    expect(screen.queryByText("Skills (dynamic)")).toBeNull();
    expect(screen.queryByText(/^~\d+ tokens$/)).toBeNull();
  });
});
