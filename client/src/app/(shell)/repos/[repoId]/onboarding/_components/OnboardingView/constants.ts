import type { IconName } from "@devdigest/ui";

export const SECTION_KEYS = ["architecture", "critical", "run", "reading", "tasks"] as const;
export const sectionId = (key: (typeof SECTION_KEYS)[number]) => `onb-${key}`;
export const SECTION_ICONS: Record<(typeof SECTION_KEYS)[number], IconName> = {
  architecture: "Boxes",
  critical: "Activity",
  run: "Command",
  reading: "ListChecks",
  tasks: "Target",
};
/** First-task complexity → badge colour. */
export const COMPLEXITY_COLOR = { Low: "var(--ok)", Medium: "var(--warn)", High: "var(--crit)" } as const;
export const COPIED_MS = 2000;
