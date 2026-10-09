import type { CSSProperties } from "react";

const recentCols = "180px 150px 70px 1fr 1fr 1fr 80px";

export const s = {
  page: { padding: "20px 28px 40px", maxWidth: 980, margin: "0 auto" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-end", marginBottom: 6 } satisfies CSSProperties,
  title: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } satisfies CSSProperties,
  headRight: { marginLeft: "auto" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 24, marginTop: 8 } satisfies CSSProperties,
  agentIcon: { width: 34, height: 34, borderRadius: 8, background: "var(--accent-bg)", color: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 } satisfies CSSProperties,
  agentBody: { minWidth: 0, flex: 1 } satisfies CSSProperties,
  agentTop: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  agentName: { fontSize: 14.5, fontWeight: 700 } satisfies CSSProperties,
  chip: { fontSize: 10.5, color: "var(--text-muted)", padding: "1px 6px", borderRadius: 4, border: "1px solid var(--border)" } satisfies CSSProperties,
  lastRun: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 } satisfies CSSProperties,
  mini: { textAlign: "center", minWidth: 66 } satisfies CSSProperties,
  miniLabel: { fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" } satisfies CSSProperties,
  chevron: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  sparkSlot: { width: 60, height: 24 } satisfies CSSProperties,
  table: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)", marginTop: 8 } satisfies CSSProperties,
  empty: { padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--text-muted)", border: "1px dashed var(--border-strong)", borderRadius: 9, marginTop: 8 } satisfies CSSProperties,
  agentName2: { fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } satisfies CSSProperties,
  muted: { color: "var(--text-secondary)", fontSize: 11.5 } satisfies CSSProperties,
  version: { color: "var(--accent-text)" } satisfies CSSProperties,
  pass: { fontWeight: 600 } satisfies CSSProperties,
} as const;

export function agentRow(hover: boolean): CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 16, padding: "14px 16px", borderRadius: 10, textDecoration: "none", color: "inherit",
    border: `1px solid ${hover ? "var(--border-strong)" : "var(--border)"}`, background: hover ? "var(--bg-hover)" : "var(--bg-elevated)",
  };
}

export function recentRow(header: boolean, last: boolean): CSSProperties {
  return {
    display: "grid", gridTemplateColumns: recentCols, gap: 12, padding: header ? "9px 16px" : "10px 16px", alignItems: "center", fontSize: header ? 10.5 : 12.5,
    borderBottom: last ? "none" : "1px solid var(--border)", textDecoration: "none", color: "inherit",
    ...(header ? { background: "var(--bg-surface)", fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase" as const } : {}),
  };
}
