import type { CSSProperties } from "react";

export const section: CSSProperties = { borderBottom: "1px solid var(--border)", padding: "8px 0" };
export const header: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  background: "none",
  border: 0,
  padding: "8px 0",
  color: "var(--text-primary)",
  font: "inherit",
  fontSize: 16,
  fontWeight: 600,
  textAlign: "left",
  cursor: "pointer",
};
export const body: CSSProperties = { padding: "4px 0 12px" };
