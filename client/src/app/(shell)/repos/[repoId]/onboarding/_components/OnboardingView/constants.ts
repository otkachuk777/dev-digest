export const SECTION_KEYS = ["architecture", "critical", "run", "reading", "tasks"] as const;
export const sectionId = (key: (typeof SECTION_KEYS)[number]) => `onb-${key}`;
export const COPIED_MS = 2000;
