/** Onboarding tour limits (values are the spec's numbers; see SPEC-02). */
export const GENERATION_TIMEOUT_MS = 120_000;
export const HISTORY_TIMEOUT_MS = 15_000;
export const MAX_INPUT_TOKENS = 12_000;
export const MAX_OUTPUT_TOKENS = 4_000;

export const READING_PATH_MAX = 10;
export const READING_ENTRY_MAX = 3;
export const CRITICAL_ROOTS = 5;
export const CHAIN_MAX = 3;
export const CRITICAL_MAX = 6;
export const HOW_TO_RUN_MAX = 8;
export const FIRST_TASKS_MAX = 5;

export const BODY_MAX = 4000;
export const DIAGRAM_MAX = 3000;
export const REASON_MAX = 300;
export const TITLE_MAX = 120;
export const COMMAND_MAX = 300;

export const PROMPT_ROUTES_MAX = 50;
export const PROMPT_README_TOKENS = 4000;

/** Substring patterns for generated files, excluded on top of `isJunkPath`. */
export const GENERATED_PATH_PATTERNS = [
  '/generated/',
  '__generated__/',
  '.generated.',
  '.gen.',
  '.min.',
] as const;

/** README fence languages whose lines count as shell commands. */
export const README_SHELL_LANGS = ['sh', 'bash', 'shell', 'zsh', 'console'] as const;

/** Constant labels for untrusted prompt blocks (AC-59). */
export const UNTRUSTED_LABELS = {
  facts: 'facts',
  reading_path: 'reading_path',
  critical_paths: 'critical_paths',
  routes: 'routes',
  readme: 'readme',
  repo_map: 'repo_map',
} as const;
