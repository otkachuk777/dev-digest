import type { ConventionCandidate } from '@devdigest/shared';

/** The columns of a `conventions` row the DTO needs — structural, so this file stays free of the data layer. */
export interface ConventionRow {
  id: string;
  category: string | null;
  rule: string;
  evidencePath: string | null;
  evidenceStart: number | null;
  evidenceEnd: number | null;
  evidenceSnippet: string | null;
  evidenceSha: string | null;
  confidence: number | null;
  accepted: boolean;
}

export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

/** GitHub blob URL with a line anchor. `ref` should be a commit sha so the link never drifts. */
export function evidenceUrl(
  fullName: string,
  ref: string,
  path: string,
  start: number,
  end: number,
): string {
  const anchor = end > start ? `#L${start}-L${end}` : `#L${start}`;
  return `https://github.com/${fullName}/blob/${ref}/${path}${anchor}`;
}

export function toCandidateDto(row: ConventionRow, repo: RepoBasics): ConventionCandidate {
  const path = row.evidencePath ?? '';
  const start = row.evidenceStart ?? 1;
  const end = row.evidenceEnd ?? start;
  return {
    id: row.id,
    category: row.category ?? 'other',
    rule: row.rule,
    evidence_path: path,
    evidence_start: start,
    evidence_end: end,
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_url: evidenceUrl(repo.fullName, row.evidenceSha ?? repo.defaultBranch, path, start, end),
    confidence: row.confidence ?? 0,
    accepted: row.accepted,
  };
}
