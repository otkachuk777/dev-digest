import type { CSSProperties } from "react";

export const s = {
  wrap: {
    marginTop: 16,
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "4px 0",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 10,
  } satisfies CSSProperties,
  item: {
    fontSize: 13,
  } satisfies CSSProperties,
  itemTitle: {
    color: "var(--text-primary)",
    marginLeft: 6,
  } satisfies CSSProperties,
  itemMeta: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 2,
  } satisfies CSSProperties,
} as const;
