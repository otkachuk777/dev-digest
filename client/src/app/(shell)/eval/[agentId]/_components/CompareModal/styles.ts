import type { CSSProperties } from "react";

const body: CSSProperties = { padding: "16px 18px", maxHeight: 560, overflow: "auto" };
const tiles: CSSProperties = { display: "flex", gap: 12, marginBottom: 18 };
const tile: CSSProperties = { flex: 1, padding: "12px 14px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" };
const tileLabel: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 };
const tileRow: CSSProperties = { display: "flex", alignItems: "baseline", gap: 8 };
const oldValue: CSSProperties = { fontSize: 15, color: "var(--text-muted)" };
const newValue: CSSProperties = { fontSize: 21, fontWeight: 700 };
const legend: CSSProperties = { display: "flex", gap: 14, fontSize: 11.5, color: "var(--text-secondary)", margin: "8px 0 10px" };
const legendItem: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6 };
const diff: CSSProperties = { fontSize: 12.5, lineHeight: 1.75, background: "var(--code-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", whiteSpace: "pre-wrap" };
const same: CSSProperties = { color: "var(--text-secondary)" };
const add: CSSProperties = { background: "var(--code-add)", color: "var(--text-primary)", textDecoration: "none" };
const del: CSSProperties = { background: "var(--code-del)", color: "var(--text-primary)", textDecoration: "line-through", textDecorationColor: "var(--crit)" };
const config: CSSProperties = { margin: "14px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--text-secondary)" };
const note: CSSProperties = { marginTop: 14, fontSize: 11.5, color: "var(--text-muted)" };
const footer: CSSProperties = { display: "flex", gap: 8, marginLeft: "auto" };
const message: CSSProperties = { padding: "28px 18px", color: "var(--text-muted)", fontSize: 13 };

export const s = { body, tiles, tile, tileLabel, tileRow, oldValue, newValue, legend, legendItem, diff, same, add, del, config, note, footer, message };

export const swatch = (bg: string): CSSProperties => ({ width: 11, height: 11, borderRadius: 3, background: bg });
export const delta = (up: boolean): CSSProperties => ({ fontSize: 11.5, fontWeight: 600, color: up ? "var(--ok)" : "var(--crit)" });
