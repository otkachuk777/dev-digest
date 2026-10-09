import type { CSSProperties } from "react";

const cols = "34px 160px 70px 1fr 1fr 1fr 90px 80px";

export const s = {
  bar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  hint: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  barRight: { marginLeft: "auto" } satisfies CSSProperties,
  table: { border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-elevated)", marginTop: 8 } satisfies CSSProperties,
  muted: { color: "var(--text-secondary)", fontSize: 11.5 } satisfies CSSProperties,
  version: { color: "var(--accent-text)" } satisfies CSSProperties,
  pass: { fontWeight: 600 } satisfies CSSProperties,
  failed: { gridColumn: "4 / -1", color: "var(--crit)", fontSize: 12 } satisfies CSSProperties,
  running: { gridColumn: "4 / -1", color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
} as const;

export function row(kind: "header" | "body", on: boolean, last: boolean): CSSProperties {
  const header = kind === "header";
  return {
    display: "grid", gridTemplateColumns: cols, gap: 12, padding: header ? "9px 16px" : "10px 16px", alignItems: "center",
    fontSize: header ? 10.5 : 12.5, borderBottom: last ? "none" : "1px solid var(--border)",
    background: header ? "var(--bg-surface)" : on ? "var(--bg-hover)" : "transparent",
    ...(header ? { fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase" as const } : {}),
  };
}
