/**
 * blast module constants. Repo-intel's own limits (`MAX_CALLERS_PER_SYMBOL`,
 * `BFS_DEPTH`, …) live in `repo-intel/constants.ts` — never re-declared here.
 */

/** Changed files queried for prior-PR history (one GitHub call each). */
export const HISTORY_MAX_FILES = 10;
/** Commits per file walked for associated merged PRs. */
export const HISTORY_COMMITS_PER_FILE = 5;
/** Prior PRs returned after dedupe + sort. */
export const HISTORY_MAX_PRS = 5;
