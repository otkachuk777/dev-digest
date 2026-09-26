import { describe, it, expect } from 'vitest';
import { reviewAgeLabel, isReviewStale } from '../src/modules/pulls/review-age.js';

const NOW = new Date('2026-09-24T12:00:00Z');

describe('reviewAgeLabel', () => {
  it('formats elapsed time', () => {
    expect(reviewAgeLabel('2026-09-21T12:00:00Z', NOW)).toBe('3d');
  });
});

describe('isReviewStale', () => {
  it('is fresh for a review from today', () => {
    expect(isReviewStale('2026-09-24T11:00:00Z', 7, NOW)).toBe(false);
  });
});
