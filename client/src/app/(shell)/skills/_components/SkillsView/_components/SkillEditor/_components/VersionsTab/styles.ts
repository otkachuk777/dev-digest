import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 760, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  date: { fontSize: 13, color: "var(--text-secondary)", flex: 1 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
  diff: {
    margin: "-2px 0 6px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--code-bg)",
    overflow: "auto",
    maxHeight: 360,
  } satisfies CSSProperties,
  diffTitle: { padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  diffLine: (type: "same" | "add" | "del"): CSSProperties => ({
    display: "block",
    padding: "0 12px",
    fontSize: 12,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    color: type === "same" ? "var(--text-secondary)" : "var(--text-primary)",
    background: type === "add" ? "var(--ok-bg)" : type === "del" ? "var(--crit-bg)" : "transparent",
  }),
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
