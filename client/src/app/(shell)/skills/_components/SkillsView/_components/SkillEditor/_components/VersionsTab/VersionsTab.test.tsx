import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/skills.json";

const restoreMutate = vi.fn();
const versions = [
  { skill_id: "s1", version: 2, body: "line one\nline TWO", created_at: "2026-09-02T00:00:00Z" },
  { skill_id: "s1", version: 1, body: "line one\nline two", created_at: "2026-09-01T00:00:00Z" },
];
vi.mock("@/lib/api/skills", () => ({
  useSkillVersions: () => ({ data: versions, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  restoreMutate.mockClear();
});

const setup = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <VersionsTab skillId="s1" currentVersion={2} />
    </NextIntlClientProvider>,
  );

describe("VersionsTab", () => {
  it("offers Diff and Restore only on the older versions", () => {
    setup();
    expect(screen.getAllByRole("button", { name: "Diff" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(1);
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("Diff shows what changed between that version and the current one", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Diff" }));
    const diff = screen.getByTestId("diff-v1");
    expect(diff.querySelector('[data-type="del"]')).toHaveTextContent("line two");
    expect(diff.querySelector('[data-type="add"]')).toHaveTextContent("line TWO");
    fireEvent.click(screen.getByRole("button", { name: "Hide diff" }));
    expect(screen.queryByTestId("diff-v1")).toBeNull();
  });

  it("Restore restores that version", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(restoreMutate).toHaveBeenCalledWith({ id: "s1", version: 1 }, expect.any(Object));
  });
});
