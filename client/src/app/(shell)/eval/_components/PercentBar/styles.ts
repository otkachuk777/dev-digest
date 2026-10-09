import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 7 } satisfies CSSProperties,
  track: { flex: 1, height: 6, background: "var(--bg-hover)", borderRadius: 3, overflow: "hidden" } satisfies CSSProperties,
  label: { fontSize: 11, color: "var(--text-secondary)", width: 34, textAlign: "right" } satisfies CSSProperties,
} as const;
