import type { CSSProperties } from "react";

export const s = {
  page: { display: "flex", flexDirection: "column", padding: "24px 28px 40px", maxWidth: 1080, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 } satisfies CSSProperties,
  headText: { flex: 1 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  meta: { margin: "5px 0 0", fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
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
