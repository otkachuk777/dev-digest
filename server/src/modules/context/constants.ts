/** Token budget of the injected Project context section, per run (AC-32). */
export const CONTEXT_BUDGET_TOKENS = 8000;

/** Appended to / replacing the text of a doc cut by the budget. */
export const TRUNCATED_MARKER = '[truncated]';

/**
 * Characters a doc path must not contain: the path is rendered raw in a
 * `### <path>` heading of the prompt, so no newlines, quotes, backticks or angle brackets.
 */
// eslint-disable-next-line no-control-regex
export const UNSAFE_PATH_CHARS = /[\x00-\x1f\x7f"`<>]/;
