/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

// ---- PR Intent ----

/** Max GitHub issue/PR + plan-file links followed out of a PR's body. */
export const MAX_INTENT_LINKS = 5;
/** Max sources recorded on the intent (used + unavailable combined). */
export const MAX_INTENT_SOURCES = 10;
/** Hard bound on the intent classifier call (its own `timeoutMs` isn't honored — see INSIGHTS). */
export const INTENT_TIMEOUT_MS = 60_000;
