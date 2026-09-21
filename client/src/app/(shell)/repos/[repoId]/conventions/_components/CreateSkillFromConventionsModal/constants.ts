import type { SkillType } from "@devdigest/shared";

export const MODAL_WIDTH = 760;
export const BODY_ROWS = 18;
export const DEFAULT_TYPE: SkillType = "convention";
export const SKILL_TYPES: SkillType[] = ["rubric", "convention", "security", "custom"];
/** The skill every scan feeds into — named by the assignment. */
export const SKILL_NAME = "repo-conventions";
export const SLUG_WORDS = 4;
export const STOPWORDS = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "that", "with", "by", "is", "are", "be"]);
