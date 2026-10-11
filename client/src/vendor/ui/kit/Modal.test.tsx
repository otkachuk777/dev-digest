import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Modal } from "./Modal";

afterEach(cleanup);

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      {open && (
        <Modal title="T" onClose={() => { onClose(); setOpen(false); }}>
          <button>first</button>
          <button>last</button>
        </Modal>
      )}
    </>
  );
}
import React from "react";

describe("Modal a11y (NFR-8)", () => {
  it("moves focus into the dialog, closes on Escape and gives focus back to the opener", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByText("opener");
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("wraps Tab and Shift+Tab inside the dialog", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("opener"));
    const close = screen.getByRole("button", { name: "Close" });
    const last = screen.getByText("last");
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("labels the dialog by its title", () => {
    render(<Modal title="Hello" onClose={() => {}}>x</Modal>);
    expect(screen.getByRole("dialog", { name: "Hello" })).toBeInTheDocument();
  });
});
