import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  legendRow: {
    display: "flex",
    gap: 16,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
    border: "1.5px solid",
  } satisfies CSSProperties,
  nodeRect: {
    fill: "var(--bg-elevated)",
    strokeWidth: 1.5,
  } satisfies CSSProperties,
  nodeLabel: {
    fontSize: 11,
    fill: "var(--text-primary)",
  } satisfies CSSProperties,
  edge: {
    fill: "none",
    stroke: "var(--border-strong)",
    strokeWidth: 1.25,
  } satisfies CSSProperties,
} as const;
