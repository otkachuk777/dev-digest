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

  it("does not render raw HTML from the source", () => {
    const { container } = render(<Markdown>{"<img src=x onerror=alert(1)>"}</Markdown>);
    expect(container.querySelector("img")).toBeNull();
  });
});
