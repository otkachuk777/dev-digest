import type { CSSProperties } from "react";

export const s = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 4px",
    cursor: "pointer",
    background: "var(--bg-primary)",
    border: "none",
    width: "100%",
    textAlign: "left",
  } satisfies CSSProperties,
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
    flexShrink: 0,
  } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  findingsCount: { fontSize: 12, color: "var(--crit)", fontWeight: 600 } satisfies CSSProperties,
  filesCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 10, padding: "4px 0 8px" } satisfies CSSProperties,
} as const;

export function headerStyle(): CSSProperties {
  return { ...s.header, position: "sticky", top: "var(--pr-header-h, 0px)", zIndex: 2 };
}
