import ms from 'ms';

/**
 * Human-readable age of the last review for the PR list ("3d", "5h").
 * Pure — no DB access.
 */
export function reviewAgeLabel(reviewedAt: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(reviewedAt).getTime();
  return ms(elapsed);
}

/** True when the last review is older than `staleDays`. */
export function isReviewStale(reviewedAt: string, staleDays: number, now: Date = new Date()): boolean {
  const elapsedDays = (now.getTime() - new Date(reviewedAt).getTime()) / (1000 * 60 * 60);
  return elapsedDays > staleDays;
}
