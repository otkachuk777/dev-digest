import type { IntentConfidence } from "@devdigest/shared";

/** Confidence badge color mapping — high green, medium amber, low muted. */
export const CONFIDENCE_META: Record<IntentConfidence, { color: string; bg: string }> = {
  high: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};
