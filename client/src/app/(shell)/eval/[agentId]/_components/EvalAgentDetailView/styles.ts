import type { CSSProperties } from "react";

export const s = {
  page: { padding: "20px 28px 40px", maxWidth: 980, margin: "0 auto" } satisfies CSSProperties,
  back: { display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, padding: "4px 8px 4px 4px", borderRadius: 6, color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, textDecoration: "none" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-end", marginBottom: 18 } satisfies CSSProperties,
  title: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  chip: { fontSize: 11.5, fontWeight: 500, color: "var(--text-muted)", padding: "2px 7px", borderRadius: 5, border: "1px solid var(--border)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } satisfies CSSProperties,
  controls: { marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" } satisfies CSSProperties,
  ranges: { display: "inline-flex", gap: 2, padding: 2, border: "1px solid var(--border)", borderRadius: 7 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  tile: { flex: 1, padding: 18, borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" } satisfies CSSProperties,
  tileTop: { display: "flex", alignItems: "center", justifyContent: "space-between" } satisfies CSSProperties,
  tileLabel: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em", textTransform: "uppercase" } satisfies CSSProperties,
  tileValueRow: { display: "flex", alignItems: "baseline", gap: 10, marginTop: 12 } satisfies CSSProperties,
  tileValue: { fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  trendHead: { display: "flex", alignItems: "center", gap: 16, marginBottom: 12 } satisfies CSSProperties,
  legend: { marginLeft: "auto", display: "flex", gap: 14, fontSize: 11.5 } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-secondary)" } satisfies CSSProperties,
  empty: { padding: "28px 16px", textAlign: "center", fontSize: 13, color: "var(--text-muted)", border: "1px dashed var(--border-strong)", borderRadius: 9 } satisfies CSSProperties,
  notFound: { padding: "60px 28px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, fontSize: 15 } satisfies CSSProperties,
  trendCard: { marginBottom: 20 } satisfies CSSProperties,
} as const;

export function tileDelta(dir: "up" | "down" | "flat"): CSSProperties {
  return { fontSize: 13, fontWeight: 600, color: dir === "down" ? "var(--crit)" : dir === "up" ? "var(--ok)" : "var(--text-muted)" };
}

export function legendSwatch(color: string): CSSProperties {
  return { width: 10, height: 2, background: color, borderRadius: 2 };
}
