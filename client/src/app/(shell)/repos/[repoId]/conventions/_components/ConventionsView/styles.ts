import type { CSSProperties } from "react";

export const s = {
  page: { padding: "20px 28px 40px", maxWidth: 880, margin: "0 auto" } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
  } satisfies CSSProperties,
  title: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  scanButtons: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  skeleton: { marginBottom: 12, borderRadius: 9 } satisfies CSSProperties,
} as const;
