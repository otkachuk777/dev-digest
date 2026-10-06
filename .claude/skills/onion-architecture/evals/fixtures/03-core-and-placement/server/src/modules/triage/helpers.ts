import type { FindingRow } from './repository.js';

export type FindingDto = {
  id: string;
  review_id: string;
  severity: 'critical' | 'major' | 'minor';
  title: string;
  file: string;
  line: number;
  dismissed_at: string | null;
};

export function toFindingDto(row: FindingRow): FindingDto {
  return {
    id: row.id,
    review_id: row.reviewId,
    severity: row.severity as FindingDto['severity'],
    title: row.title,
    file: row.file,
    line: row.line,
    dismissed_at: row.dismissedAt ? row.dismissedAt.toISOString() : null,
  };
}
