import type { CSSProperties } from "react";

export const section: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  background: "var(--bg-elevated)",
  marginBottom: 14,
  overflow: "hidden",
  scrollMarginTop: 16,
};
export const heading: CSSProperties = { margin: 0 };
export const header: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "13px 16px",
  background: "none",
  border: 0,
  color: "var(--text-primary)",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
};
export const tile: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 7,
  background: "var(--accent-bg)",
  color: "var(--accent)",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};
export const title: CSSProperties = { fontSize: 14.5, fontWeight: 600, flex: 1 };
export const chevron = (open: boolean): CSSProperties => ({
  color: "var(--text-muted)",
  transform: open ? "rotate(180deg)" : "none",
  transition: "transform .15s",
});
export const body: CSSProperties = { padding: "0 16px 16px" };
