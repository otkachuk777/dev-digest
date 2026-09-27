import type { CSSProperties } from "react";

export const s = {
  group: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 6px",
    background: "none",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    textAlign: "left",
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  symbolName: {
    flex: 1,
    fontWeight: 600,
  } satisfies CSSProperties,
  count: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  callers: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingLeft: 30,
    paddingBottom: 8,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  } satisfies CSSProperties,
} as const;
