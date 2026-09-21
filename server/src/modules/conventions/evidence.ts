const MIN_SNIPPET_CHARS = 8;

export interface VerifiedEvidence {
  startLine: number;
  endLine: number;
  snippet: string;
}

/**
 * Locate a model-quoted snippet in the file (line-trimmed, contiguous) and
 * return the REAL line range. The model's own line numbers are only a
 * tiebreaker between duplicate matches — they are routinely off by a few lines.
 *
 * ponytail: contiguous match only — a snippet that skips blank file lines is
 * rejected; loosen to a fuzzy match if the quality report shows real misses.
 */
export function verifyEvidence(
  fileText: string,
  claim: { snippet: string; startLine: number },
): VerifiedEvidence | null {
  const want = claim.snippet
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (want.join('').length < MIN_SNIPPET_CHARS) return null;

  const lines = fileText.split('\n');
  const norm = lines.map((l) => l.trim());
  const hits: number[] = [];
  for (let i = 0; i + want.length <= norm.length; i++) {
    if (want.every((w, k) => norm[i + k] === w)) hits.push(i);
  }
  if (!hits.length) return null;

  const best = hits.reduce((a, b) =>
    Math.abs(b + 1 - claim.startLine) < Math.abs(a + 1 - claim.startLine) ? b : a,
  );
  return {
    startLine: best + 1,
    endLine: best + want.length,
    snippet: lines.slice(best, best + want.length).join('\n'),
  };
}
