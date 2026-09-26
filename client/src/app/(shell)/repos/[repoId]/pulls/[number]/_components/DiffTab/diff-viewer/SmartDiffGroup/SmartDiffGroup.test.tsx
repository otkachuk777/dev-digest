import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import prReview from "../../../../../../../../../../../messages/en/prReview.json";
import { SmartDiffGroup } from "./SmartDiffGroup";

afterEach(cleanup);

function setup(props: Partial<ComponentProps<typeof SmartDiffGroup>> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      <SmartDiffGroup role="core" fileCount={3} filesWithFindings={2} {...props}>
        <div>child file card</div>
      </SmartDiffGroup>
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffGroup", () => {
  it("a core group renders its children open, with the file count and findings dot", () => {
    setup({ role: "core" });
    expect(screen.getByText("child file card")).toBeInTheDocument();
    expect(screen.getByText("3 files")).toBeInTheDocument();
    expect(screen.getByText("● 2")).toBeInTheDocument();
  });

  it("a docs group starts collapsed, and the header toggles it open", () => {
    setup({ role: "docs" });
    expect(screen.queryByText("child file card")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("child file card")).toBeInTheDocument();
  });

  it("shows no findings dot when filesWithFindings is 0", () => {
    setup({ role: "core", filesWithFindings: 0 });
    expect(screen.queryByText(/●/)).not.toBeInTheDocument();
  });
});
