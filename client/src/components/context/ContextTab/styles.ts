import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" } satisfies CSSProperties,
  filter: { marginLeft: "auto", width: 220 } satisfies CSSProperties,
  warn: {
    fontSize: 12.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    borderRadius: 6,
    padding: "6px 10px",
    margin: "8px 0",
  } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--danger)", margin: "8px 0" } satisfies CSSProperties,
  message: { fontSize: 13, color: "var(--text-secondary)", margin: "8px 0" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 4, listStyle: "none", margin: "12px 0 0", padding: 0 } satisfies CSSProperties,
  order: { display: "flex", flexDirection: "column", width: 22 } satisfies CSSProperties,
  spacer: { width: 22 } satisfies CSSProperties,
  label: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  path: { fontSize: 13.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  missing: { fontSize: 12, color: "var(--warn)", flexShrink: 0 } satisfies CSSProperties,
} as const;

export function row(attached: boolean, draggable: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 10px",
    borderRadius: 8,
    background: attached ? "var(--bg-hover)" : "transparent",
    cursor: draggable ? "grab" : "default",
  };
}

/** The kit's IconBtn has no `disabled`; the boundary row's ↑ / ↓ is dimmed here. */
export function orderBtnWrap(disabled: boolean): CSSProperties {
  return { opacity: disabled ? 0.3 : 1, pointerEvents: disabled ? "none" : "auto" };
}
