import type { CSSProperties } from "react";

export const b = {
  layout: { display: "grid", gridTemplateColumns: "180px minmax(0, 1fr)", gap: 24, marginTop: 12 } satisfies CSSProperties,
  toc: { position: "sticky", top: 12, alignSelf: "start", display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  tocLabel: { fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  tocItem: { background: "none", border: 0, padding: "4px 0", textAlign: "left", font: "inherit", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "6px 0" } satisfies CSSProperties,
  list: { listStyle: "decimal", paddingLeft: 22, margin: 0 } satisfies CSSProperties,
  item: { padding: "4px 0" } satisfies CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
  reason: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { margin: 0, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 } satisfies CSSProperties,
  card: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)" } satisfies CSSProperties,
};
