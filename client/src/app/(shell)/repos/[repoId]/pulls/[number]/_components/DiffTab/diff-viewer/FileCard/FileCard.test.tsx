import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import shell from "../../../../../../../../../../../messages/en/shell.json";
import prReview from "../../../../../../../../../../../messages/en/prReview.json";
import { FileCard } from "./FileCard";
import type { DiffFindingsApi } from "../findings";

vi.mock("@/lib/api/eval", () => ({ useCaseFromFinding: () => ({ mutate: vi.fn(), isPending: false }) }));

afterEach(cleanup);

// A one-hunk patch that adds line 11.
const PATCH = `@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const FILE: PrFile = { path: "src/config.ts", additions: 1, deletions: 0, patch: PATCH };

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f-anchored",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    review_id: "rev1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function setup(show: boolean) {
  const anchored = finding({ id: "f-anchored", title: "Anchored finding", start_line: 11 });
  const unanchored = finding({ id: "f-far", title: "Unanchored finding", start_line: 999 });
  const onAction = vi.fn();
  const findings: DiffFindingsApi = {
    byPath: new Map([["src/config.ts", [anchored, unanchored]]]),
    show,
    onAction,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <FileCard file={FILE} findings={findings} />
    </NextIntlClientProvider>,
  );
  return { onAction };
}

describe("FileCard — Smart Diff findings", () => {
  it("with findings visible: shows the dot, the anchored finding, the blocker label, and the unanchored block", () => {
    setup(true);
    expect(screen.getByTitle("2 findings")).toBeInTheDocument();
    expect(screen.getByText("Anchored finding")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByText("1 finding outside the diff")).toBeInTheDocument();
    expect(screen.getByText("Unanchored finding")).toBeInTheDocument();
  });

  it("with findings hidden: the dot stays but neither finding renders", () => {
    setup(false);
    expect(screen.getByTitle("2 findings")).toBeInTheDocument();
    expect(screen.queryByText("Anchored finding")).not.toBeInTheDocument();
    expect(screen.queryByText("Unanchored finding")).not.toBeInTheDocument();
  });
});

describe("FileCard — diff target (SPEC-03)", () => {
  const scroll = vi.fn();
  const view = (file: PrFile, target?: { file: string; line: number | null }) =>
    render(
      <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
        <FileCard file={file} target={target} />
      </NextIntlClientProvider>,
    );
  beforeEach(() => {
    scroll.mockClear();
    Element.prototype.scrollIntoView = scroll;
  });

  it("AC-23: scrolls to and highlights the target new-side line", () => {
    view(FILE, { file: "src/config.ts", line: 11 });
    const row = screen.getByText(/stripeKey/).parentElement as HTMLElement;
    expect(row).toHaveAttribute("aria-current", "location");
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(row.parentElement);
  });

  it("AC-24: a line that is not rendered scrolls the header instead", () => {
    view(FILE, { file: "src/config.ts", line: 999 });
    expect(document.querySelector("[aria-current]")).toBeNull();
    expect(scroll.mock.contexts[0]).toBe(screen.getByText("src/config.ts").parentElement);
  });

  it("AC-24/EC-7: no line, or a file without a patch, expands and scrolls the header", () => {
    view({ path: "bin.png", additions: 0, deletions: 0, patch: null }, { file: "bin.png", line: null });
    expect(screen.getByText(/No diff text available/)).toBeInTheDocument();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("EC-6: a card over the auto-expand limit opens when it is the target", () => {
    const big: PrFile = { ...FILE, additions: 250 };
    view(big, { file: "src/config.ts", line: 11 });
    expect(screen.getByText(/stripeKey/)).toBeInTheDocument();
  });

  it("AC-22: the target card gets an accent border; others do not", () => {
    const { container } = view(FILE, { file: "src/config.ts", line: null });
    expect((container.firstChild as HTMLElement).style.borderLeftColor).toBe("var(--accent)");
  });

  it("F4: collapsing and re-expanding the target card does not scroll again", () => {
    view(FILE, { file: "src/config.ts", line: 11 });
    expect(scroll).toHaveBeenCalledTimes(1);
    const header = screen.getByText("src/config.ts");
    fireEvent.click(header);
    fireEvent.click(header);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("without a target nothing scrolls", () => {
    view(FILE);
    expect(scroll).not.toHaveBeenCalled();
  });
});
