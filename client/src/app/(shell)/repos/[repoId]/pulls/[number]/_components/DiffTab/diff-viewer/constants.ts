/** Constants for the DiffViewer. */
import type { Severity } from "@devdigest/shared";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Wire `Severity` → the CodeLine's inline label i18n key. */
export const SEVERITY_LINE_LABEL: Record<Severity, "blocker" | "warning" | "suggestion"> = {
  CRITICAL: "blocker",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};
