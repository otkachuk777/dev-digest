import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import shell from "../../../../../../../../../../../messages/en/shell.json";
import prReview from "../../../../../../../../../../../messages/en/prReview.json";
import { FileCard } from "./FileCard";
import type { DiffFindingsApi } from "../findings";

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
