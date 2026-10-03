"use client";

import React from "react";
import { box } from "./styles";

let seq = 0;

/** Mermaid diagrams must start with a known graph keyword. Anything else
 *  (prose, JSON, empty) is not a diagram → skip. */
const MERMAID_RE =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context)\b/;

/** Mermaid can't read CSS variables, so resolve the app's current theme to concrete colours. */
function themeVars() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    background: "transparent",
    primaryColor: v("--bg-surface", "#141414"),
    primaryBorderColor: v("--accent", "#3b82f6"),
    primaryTextColor: v("--text-primary", "#ededed"),
    lineColor: v("--text-muted", "#6a6a6a"),
    textColor: v("--text-primary", "#ededed"),
    secondaryColor: v("--bg-surface", "#141414"),
    tertiaryColor: v("--bg-surface", "#141414"),
    clusterBkg: "transparent",
    clusterBorder: v("--border-strong", "#3a3a3a"),
    edgeLabelBackground: v("--bg-primary", "#0a0a0a"),
    fontFamily: "JetBrains Mono, monospace",
    fontSize: "12px",
  };
}

/**
 * Renders a mermaid diagram string to inline SVG. mermaid is imported lazily
 * (client-only). We VALIDATE with mermaid.parse({suppressErrors}) before
 * rendering — mermaid otherwise injects a "Syntax error" graphic into the DOM.
 * Junk/unparseable input renders nothing. Diagram text is untrusted (LLM output):
 * strict security level and no HTML labels.
 */
export function MermaidDiagram({ chart, label }: { chart: string; label: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<"pending" | "ok" | "invalid">("pending");

  React.useEffect(() => {
    let cancelled = false;
    const src = (chart ?? "").trim();
    if (!MERMAID_RE.test(src)) {
      setState("invalid");
      return;
    }
    setState("pending");
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: themeVars(),
          securityLevel: "strict",
          htmlLabels: false,
          flowchart: { htmlLabels: false },
        });
        const valid = await mermaid.parse(src, { suppressErrors: true });
        if (cancelled) return;
        if (!valid) {
          setState("invalid");
          return;
        }
        const { svg } = await mermaid.render(`dd-mermaid-${seq++}`, src);
        if (cancelled) return;
        if (ref.current) ref.current.innerHTML = svg;
        setState("ok");
      } catch {
        if (!cancelled) setState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (state === "invalid") return null;

  return <div ref={ref} role="img" aria-label={label} style={box(state === "ok")} />;
}

export default MermaidDiagram;
