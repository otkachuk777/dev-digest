import type { CSSProperties } from "react";

/** A subtle muted line — the tour itself is the star of the page. */
export const banner: CSSProperties = {
  color: "var(--text-muted)",
  fontSize: 12,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  marginBottom: 14,
};
