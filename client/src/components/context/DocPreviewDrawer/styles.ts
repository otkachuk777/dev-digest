import type { CSSProperties } from "react";

export const s = {
  meta: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  toggle: { marginBottom: 16 } satisfies CSSProperties,
  message: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
