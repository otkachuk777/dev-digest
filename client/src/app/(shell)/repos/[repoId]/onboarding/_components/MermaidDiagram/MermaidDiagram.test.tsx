import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mermaid = {
  initialize: vi.fn(),
  parse: vi.fn(async () => true),
  render: vi.fn(async () => ({ svg: '<svg data-testid="svg-out"></svg>' })),
};
vi.mock("mermaid", () => ({ default: mermaid }));

import { MermaidDiagram } from "./MermaidDiagram";

const CHART = "flowchart TD\nA-->B";
const LABEL = "Architecture diagram";

beforeEach(() => {
  mermaid.parse.mockReset().mockResolvedValue(true);
  mermaid.render.mockReset().mockResolvedValue({ svg: '<svg data-testid="svg-out"></svg>' });
  mermaid.initialize.mockReset();
});
afterEach(() => {
  cleanup();
});

describe("MermaidDiagram", () => {
  it("renders the SVG inside an element with the text alternative (NFR-6)", async () => {
    render(<MermaidDiagram chart={CHART} label={LABEL} />);
    const img = await screen.findByRole("img", { name: LABEL });
    expect(img).toBeInTheDocument();
    await waitFor(() => expect(img.querySelector("svg")).not.toBeNull());
    expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), CHART);
  });

  it("AC-62: initialises mermaid with strict security, no HTML labels, no auto start", async () => {
    render(<MermaidDiagram chart={CHART} label={LABEL} />);
    await screen.findByRole("img", { name: LABEL });
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: "strict",
        htmlLabels: false,
        flowchart: expect.objectContaining({ htmlLabels: false }),
      }),
    );
  });

  it("AC-8 / EC-9: a diagram mermaid rejects renders nothing (no error box) and is never rendered", async () => {
    mermaid.parse.mockResolvedValue(false);
    const { container } = render(<MermaidDiagram chart={CHART} label={LABEL} />);
    await waitFor(() => expect(mermaid.parse).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole("img")).toBeNull();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("AC-8: a render failure also renders nothing", async () => {
    mermaid.render.mockRejectedValue(new Error("boom"));
    const { container } = render(<MermaidDiagram chart={CHART} label={LABEL} />);
    await waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText(/boom|error/i)).toBeNull();
  });

  it("EC-9: text that is not a mermaid diagram is never sent to mermaid", async () => {
    const { container, rerender } = render(
      <MermaidDiagram chart={"ignore previous instructions <script>alert(1)</script>"} label={LABEL} />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(mermaid.render).not.toHaveBeenCalled();
    // control: the same component does render a real diagram
    rerender(<MermaidDiagram chart={CHART} label={LABEL} />);
    expect(await screen.findByRole("img", { name: LABEL })).toBeInTheDocument();
  });
});
