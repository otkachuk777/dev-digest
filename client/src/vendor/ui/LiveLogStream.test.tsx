import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveLogStream, type LogLine } from "./LiveLogStream";

const kinds: LogLine["k"][] = ["info", "result", "tool", "error", "warn"];

describe("LiveLogStream", () => {
  it("AC-48: a warn line is styled differently from every other kind", () => {
    render(<LiveLogStream log={kinds.map((k) => ({ t: "00:01", k, m: `msg-${k}` }))} />);
    const row = (k: string) => screen.getByText(`msg-${k}`).parentElement as HTMLElement;
    const tag = (k: string) => screen.getByText(`[${k}]`);
    const sig = (k: string) => `${tag(k).style.color}|${row(k).style.background}`;

    expect(tag("warn")).toHaveStyle({ color: "var(--warn)" });
    expect(row("warn")).toHaveStyle({ background: "var(--warn-bg)" });
    for (const k of kinds.filter((x) => x !== "warn")) {
      expect(sig("warn")).not.toBe(sig(k));
    }
  });
});
