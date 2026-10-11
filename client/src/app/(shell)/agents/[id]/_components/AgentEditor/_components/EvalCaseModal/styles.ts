import type { CSSProperties } from "react";
import { lineKind } from "./helpers";

const field: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 7,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontSize: 12,
  lineHeight: 1.55,
  outline: "none",
  resize: "none",
};

export const textarea: CSSProperties = { ...field, flex: 1, minHeight: 120 };
export const expectedArea: CSSProperties = { ...field, background: "var(--code-bg)", flex: 1 };

export const s = {
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", height: 480 } satisfies CSSProperties,
  left: { borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", minWidth: 0 } satisfies CSSProperties,
  right: { display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflowY: "auto" } satisfies CSSProperties,
  diffBar: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
  pad: { padding: "14px 16px 0" } satisfies CSSProperties,
  label: { fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7 } satisfies CSSProperties,
  typeRow: { display: "flex", gap: 2, border: "1px solid var(--border)", borderRadius: 7, padding: 2, width: "fit-content" } satisfies CSSProperties,
  tabBody: { flex: 1, overflow: "auto", padding: "12px 16px", minHeight: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  pre: { margin: 0, fontSize: 11.5, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" } satisfies CSSProperties,
  filesWrap: { display: "flex", gap: 10 } satisfies CSSProperties,
  filesList: { width: 150, borderRight: "1px solid var(--border)", paddingRight: 10, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  expectedHead: { padding: "14px 16px 8px", display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  expectedBox: { margin: "0 16px", flex: 1, minHeight: 200, display: "flex" } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", margin: "6px 16px 0" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  runOnSave: { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-secondary)", marginRight: "auto" } satisfies CSSProperties,
  last: { margin: "12px 16px 16px", padding: "11px 13px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;

export const diffPreview: CSSProperties = { flex: 1, minHeight: 0, overflow: "auto", margin: "4px 0 0", border: "1px solid var(--border)", borderRadius: 7, background: "var(--code-bg)", fontSize: 11.5, lineHeight: 1.6, whiteSpace: "pre" };

/** Per-line look of the read-only diff preview: added green, removed red, hunk headers accent. */
export function diffLine(l: string): CSSProperties {
  const kind = lineKind(l);
  return { padding: "0 10px", background: kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent", color: kind === "hunk" ? "var(--accent-text)" : "var(--text-primary)" };
}

export function banner(positive: boolean): CSSProperties {
  return {
    margin: "12px 16px 0",
    padding: "9px 12px",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    gap: 9,
    fontSize: 12,
    color: "var(--text-secondary)",
    border: "1px solid " + (positive ? "var(--accent)" : "var(--border-strong)"),
    background: positive ? "var(--accent-bg)" : "var(--bg-elevated)",
  };
}

export function fileBtn(on: boolean): CSSProperties {
  return {
    textAlign: "left",
    border: "none",
    borderRadius: 5,
    padding: "4px 6px",
    fontSize: 11.5,
    cursor: "pointer",
    wordBreak: "break-all",
    color: on ? "var(--accent-text)" : "var(--text-secondary)",
    background: on ? "var(--accent-bg)" : "transparent",
  };
}
