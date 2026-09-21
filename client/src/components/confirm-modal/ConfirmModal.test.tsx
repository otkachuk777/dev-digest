import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmModal } from "./ConfirmModal";

afterEach(cleanup);

function setup(props: Partial<React.ComponentProps<typeof ConfirmModal>> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ConfirmModal
      title="Delete skill"
      body='Delete "x"? This cannot be undone.'
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  );
  return { onConfirm, onClose };
}

describe("ConfirmModal", () => {
  it("shows the question and confirms", () => {
    const { onConfirm, onClose } = setup();
    expect(screen.getByRole("dialog")).toHaveTextContent('Delete "x"? This cannot be undone.');
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cancel and the ✕ both close without confirming", () => {
    const { onConfirm, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cannot be confirmed twice while busy", () => {
    setup({ busy: true });
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
