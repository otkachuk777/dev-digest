/** Config files worth reading when present — they state conventions explicitly. */
export const CONFIG_PATHS = [
  'eslint.config.js',
  'eslint.config.mjs',
  '.eslintrc.json',
  '.eslintrc.cjs',
  '.eslintrc',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'package.json',
];

/** How many top-ranked source files repo-intel is asked for. */
export const TOP_FILES = 12;
/** Per-file cap on what is sent to the model (chars). */
export const MAX_FILE_CHARS = 8000;
export const MAX_CANDIDATES = 15;
export const MIN_CONFIDENCE = 0.5;
export const EXTRACT_TIMEOUT_MS = 90_000;
