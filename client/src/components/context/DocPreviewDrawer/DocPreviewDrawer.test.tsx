import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/context.json";

vi.mock("@/lib/api/context", () => ({
  useContextDoc: (_r: string, path: string) => ({
    isError: false,
    data: {
      path,
      type: "specs",
      tokens: 12,
      used_by_agents: 1,
      used_by_skills: 2,
      content: "# Title\n\n![pic](https://evil.test/x.png)",
    },
  }),
}));

import { DocPreviewDrawer } from "./DocPreviewDrawer";

afterEach(cleanup);

describe("DocPreviewDrawer", () => {
  it("AC-27/NFR-5: shows meta, safe markdown, toggle; Escape closes; focus is restored", () => {
    const onToggle = vi.fn();
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = render(
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <DocPreviewDrawer repoId="r1" path="specs/a.md" attached={false} onToggleAttached={onToggle} onClose={onClose} />
      </NextIntlClientProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: /specs\/a\.md/ });
    expect(dialog).toHaveFocus();
    expect(screen.getByText("12 tokens")).toBeInTheDocument();
    expect(screen.getByText("Used by 1 agent · 2 skills")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Attached" }));
    expect(onToggle).toHaveBeenCalledOnce();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    view.unmount();
    expect(opener).toHaveFocus();
  });
});
