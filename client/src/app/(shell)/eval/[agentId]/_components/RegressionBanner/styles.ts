import type { CSSProperties } from "react";

export const s = {
  banner: { display: "flex", gap: 10, alignItems: "center", padding: "11px 14px", borderRadius: 8, border: "1px solid var(--warn)", background: "var(--warn-bg)", marginBottom: 18 } satisfies CSSProperties,
  icon: { color: "var(--warn)", flexShrink: 0 } satisfies CSSProperties,
  text: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
