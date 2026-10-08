import type { Container } from '../../platform/container.js';

export class ReviewsService {
  constructor(private readonly container: Container) {}

  async finish(reviewId: string, runId: string, summary: string, tokens: number) {
    await this.container.db.transaction(async (tx) => {
      await this.container.reviewRepo.setSummary(reviewId, summary, tx);
      await this.container.reviewRepo.setStatus(reviewId, 'done', tx);
      await this.container.agentsRepo.completeRun(runId, { tokens, status: 'done' }, tx);
    });
    await this.container.jobs.enqueue('review.notify', { reviewId });
  }
}
