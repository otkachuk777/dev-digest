import type { CSSProperties } from "react";

export const s = {
  card: {
    marginBottom: 20,
  } satisfies CSSProperties,
  viewGroup: {
    display: "flex",
    gap: 2,
    padding: 2,
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  statsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 12,
  } satisfies CSSProperties,
  stat: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  degradedRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  } satisfies CSSProperties,
  noDownstream: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "12px 0",
  } satisfies CSSProperties,
} as const;
