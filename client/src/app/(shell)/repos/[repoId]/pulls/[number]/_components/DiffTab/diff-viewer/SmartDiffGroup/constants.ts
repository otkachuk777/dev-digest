import type { SmartDiffRole } from "@devdigest/shared";

/** Role → color square, using existing design tokens only. */
export const ROLE_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  tests: "var(--ok)",
  wiring: "var(--info)",
  docs: "var(--text-muted)",
  boilerplate: "var(--border-strong)",
};

/** i18n keys for each role's label + hint (explicit map, not a string template). */
export const ROLE_I18N: Record<SmartDiffRole, { label: string; hint: string }> = {
  core: { label: "smartDiff.coreLabel", hint: "smartDiff.coreHint" },
  tests: { label: "smartDiff.testsLabel", hint: "smartDiff.testsHint" },
  wiring: { label: "smartDiff.wiringLabel", hint: "smartDiff.wiringHint" },
  docs: { label: "smartDiff.docsLabel", hint: "smartDiff.docsHint" },
  boilerplate: { label: "smartDiff.boilerplateLabel", hint: "smartDiff.boilerplateHint" },
};

/** Groups that start collapsed — low-signal roles, expand on demand. */
export const COLLAPSED_BY_DEFAULT = new Set<SmartDiffRole>(["docs", "boilerplate"]);
