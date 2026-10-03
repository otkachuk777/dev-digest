import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./_components/BriefCard", () => ({ BriefCard: () => <div>brief-card</div> }));
vi.mock("./_components/IntentCard", () => ({ IntentCard: () => <div>intent-card</div> }));
vi.mock("./_components/BlastRadiusCard", () => ({ BlastRadiusCard: () => <div>blast-card</div> }));

import { OverviewTab } from "./OverviewTab";

describe("OverviewTab", () => {
  it("AC-10: the brief card comes first and Intent and Blast Radius stay", () => {
    render(
      <OverviewTab
        prId="pr1"
        headSha="abc"
        prBody={null}
        repoId="r"
        repoFullName="o/r"
        prFiles={[]}
        onOpenInDiff={() => {}}
      />,
    );
    const order = ["brief-card", "intent-card", "blast-card"].map((t) => screen.getByText(t));
    expect(order[0]!.compareDocumentPosition(order[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1]!.compareDocumentPosition(order[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
