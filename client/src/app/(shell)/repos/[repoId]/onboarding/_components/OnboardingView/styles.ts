import type { CSSProperties } from "react";

export const s = {
  page: { padding: "20px 28px 40px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 12 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  meta: { margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  notice: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "8px 12px",
    marginBottom: 12,
    fontSize: 13,
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 12, marginTop: 12 } satisfies CSSProperties,
  live: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
