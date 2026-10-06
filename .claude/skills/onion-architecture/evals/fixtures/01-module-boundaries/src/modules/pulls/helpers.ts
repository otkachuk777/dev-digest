import type { PullRow } from './repository.js';

export const STALE_AFTER_DAYS = 7;

export function isStale(row: PullRow, now: Date): boolean {
  const ageMs = now.getTime() - row.updatedAt.getTime();
  return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

export function toPullDto(row: PullRow) {
  return { id: row.id, number: row.number, title: row.title, state: row.state };
}
