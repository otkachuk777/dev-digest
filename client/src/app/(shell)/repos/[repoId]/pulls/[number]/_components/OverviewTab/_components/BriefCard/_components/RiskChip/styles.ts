import type { CSSProperties } from "react";

export const s = {
  chip: (borderColor: string, expanded: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "stretch",
    borderRadius: 7,
    overflow: "hidden",
    border: `1px solid ${borderColor}`,
    background: expanded ? "var(--bg-hover)" : "transparent",
  }),
  go: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    alignItems: "flex-start",
    padding: "5px 9px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  titleRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  ref: { fontSize: 10.5, color: "var(--accent-text)" } satisfies CSSProperties,
  toggle: {
    display: "grid",
    placeItems: "center",
    width: 26,
    border: "none",
    borderLeft: "1px solid var(--border)",
    background: "transparent",
    cursor: "pointer",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  chevron: (expanded: boolean): CSSProperties => ({
    transform: expanded ? "rotate(180deg)" : "none",
    transition: "transform .15s",
  }),
} as const;
