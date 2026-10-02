import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "./Markdown";

const body = `## What

- first item
- second item

| Agent | Role |
|---|---|
| planner | plans |
`;

describe("Markdown", () => {
  it("renders headings, lists and GFM tables as real elements", () => {
    render(<Markdown>{body}</Markdown>);

    expect(screen.getByRole("heading", { level: 2, name: "What" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("list")).toHaveStyle({ listStyle: "disc" });
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Agent" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "planner" })).toBeInTheDocument();
  });

  it("AC-7: noRemoteImages renders alt text instead of an <img>", () => {
    const { container } = render(<Markdown noRemoteImages>{"![diagram](https://evil.test/x.png)"}</Markdown>);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("diagram")).toBeInTheDocument();
  });

  it("AC-7: noRemoteImages without alt renders a plain link, not an <img>", () => {
    const { container } = render(<Markdown noRemoteImages>{"![](https://evil.test/x.png)"}</Markdown>);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://evil.test/x.png");
  });

  it("images still render by default", () => {
    const { container } = render(<Markdown>{"![diagram](https://x.test/x.png)"}</Markdown>);
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("does not render raw HTML from the source", () => {
    const { container } = render(<Markdown>{"<img src=x onerror=alert(1)>"}</Markdown>);
    expect(container.querySelector("img")).toBeNull();
  });
});
