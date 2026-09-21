import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/conventions.json";

const extract = vi.fn();
const update = vi.fn();
const reject = vi.fn();
let scan: { items: ConventionCandidate[]; sample_count: number; scanned_at: string | null } = {
  items: [],
  sample_count: 0,
  scanned_at: null,
};

vi.mock("@/components/app-shell", () => ({ ShellCrumb: () => null }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", name: "quick-blog", full_name: "burnjohn/quick-blog" } }),
}));
vi.mock("@/lib/api/conventions", () => ({
  useConventions: () => ({ data: scan, isLoading: false, isError: false }),
  useExtractConventions: () => ({ mutate: extract, isPending: false, isError: false }),
  useUpdateConvention: () => ({ mutate: update }),
  useRejectConvention: () => ({ mutate: reject }),
}));
vi.mock("../CreateSkillFromConventionsModal", () => ({
  CreateSkillFromConventionsModal: ({ conventions }: { conventions: ConventionCandidate[] }) => (
    <div data-testid="skill-modal">{conventions.map((c) => c.rule).join("|")}</div>
  ),
}));

import { ConventionsView } from "./ConventionsView";

const c = (id: string, accepted: boolean): ConventionCandidate => ({
  id,
  category: "style",
  rule: `Rule ${id}`,
  evidence_path: "src/a.ts",
  evidence_start: 1,
  evidence_end: 2,
  evidence_snippet: "code();",
  evidence_url: "https://github.com/o/r/blob/abc/src/a.ts#L1-L2",
  confidence: 0.9,
  accepted,
});

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ConventionsView", () => {
  it("before a scan: Run Scan is the live button, ReScan is disabled, no Create skill", () => {
    scan = { items: [], sample_count: 0, scanned_at: null };
    setup();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ReScan" })).toBeDisabled();
    const runScan = screen.getAllByRole("button", { name: "Run Scan" })[0]!;
    expect(runScan).toBeEnabled();
    fireEvent.click(runScan);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Create skill" })).toBeNull();
  });

  it("after a scan: ReScan is live, Run Scan is disabled, cards render", () => {
    scan = { items: [c("1", false), c("2", false)], sample_count: 12, scanned_at: null };
    setup();
    expect(screen.getByRole("button", { name: "Run Scan" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "ReScan" }));
    expect(extract).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("convention-card")).toHaveLength(2);
    expect(screen.getByText("0 of 2 accepted")).toBeInTheDocument();
  });

  it("Create skill only appears once something is accepted, and gets only the accepted rules", () => {
    scan = { items: [c("1", true), c("2", false)], sample_count: 12, scanned_at: null };
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByTestId("skill-modal")).toHaveTextContent("Rule 1");
    expect(screen.getByTestId("skill-modal")).not.toHaveTextContent("Rule 2");
  });

  it("Accept all / Deselect all bulk-update the candidates that need changing", () => {
    scan = { items: [c("1", true), c("2", false)], sample_count: 12, scanned_at: null };
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ id: "2", patch: { accepted: true } });
  });
});
