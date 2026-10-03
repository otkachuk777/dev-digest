/** PR Brief limits (values are the spec's numbers; see SPEC-03). */
export const GENERATION_TIMEOUT_MS = 60_000;
export const MAX_OUTPUT_TOKENS = 2_000;

export const RISKS_MAX = 6;
export const FOCUS_MAX = 8;
export const SUMMARY_MAX = 600;
export const EXPLANATION_MAX = 600;
export const REASON_MAX = 200;
export const TITLE_MAX = 120;

/** Latest-review findings sent to the model (OQ-2). */
export const FINDINGS_MAX = 30;

/** EC-12 — not Smart Diff's ROLE_ORDER (wiring before tests here). */
export const BRIEF_ROLE_ORDER = ['core', 'wiring', 'tests', 'docs', 'boilerplate'] as const;
export const SEVERITY_ORDER = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;
export const SPEC_DOC_DIRS = ['specs', 'docs', 'insights'] as const;
