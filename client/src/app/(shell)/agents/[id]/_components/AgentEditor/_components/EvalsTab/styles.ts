import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  strip: { display: "flex", gap: 10, marginBottom: 18 } satisfies CSSProperties,
  tile: { flex: 1, padding: "11px 13px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" } satisfies CSSProperties,
  tileLabel: { fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 } satisfies CSSProperties,
  tileValueRow: { display: "flex", alignItems: "baseline", gap: 7 } satisfies CSSProperties,
  tileValue: { fontSize: 22, fontWeight: 700 } satisfies CSSProperties,
  note: { fontSize: 11.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, marginBottom: 20 } satisfies CSSProperties,
  noRuns: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 18 } satisfies CSSProperties,
  casesHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  empty: { padding: "28px 16px", textAlign: "center", fontSize: 13, color: "var(--text-muted)", border: "1px dashed var(--border-strong)", borderRadius: 9, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 } satisfies CSSProperties,
  rowBody: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  rowTop: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  name: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  result: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
} as const;

export function tileDelta(dir: "up" | "down" | "flat"): CSSProperties {
  return { fontSize: 11.5, fontWeight: 600, color: dir === "down" ? "var(--crit)" : "var(--ok)" };
}

export function row(hover: boolean): CSSProperties {
  return { display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 7, border: "1px solid var(--border)", background: hover ? "var(--bg-hover)" : "var(--bg-elevated)", cursor: "pointer", marginBottom: 6 };
}

export function typeTag(mustFind: boolean): CSSProperties {
  return {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.03em", padding: "1px 7px", borderRadius: 4, textTransform: "uppercase",
    color: mustFind ? "var(--accent-text)" : "var(--text-muted)",
    background: mustFind ? "var(--accent-bg)" : "var(--bg-hover)",
    border: "1px solid " + (mustFind ? "var(--accent)" : "var(--border-strong)"),
  };
}
