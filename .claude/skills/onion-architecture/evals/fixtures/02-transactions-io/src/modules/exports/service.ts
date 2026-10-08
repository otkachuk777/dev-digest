import type { Container } from '../../platform/container.js';

export class ExportsService {
  constructor(private readonly container: Container) {}

  async publishSummary(owner: string, repo: string, number: number, reviewId: string, summary: string) {
    const github = await this.container.github();
    await this.container.db.transaction(async (tx) => {
      await this.container.reviewRepo.setSummary(reviewId, summary, tx);
      const comment = await github.postComment(owner, repo, number, summary);
      await this.container.reviewRepo.setStatus(reviewId, `published:${comment.id}`, tx);
    });
  }

  async exportFindings(owner: string, repo: string, number: number, reviewId: string) {
    const github = await this.container.github();
    const rows = await this.container.findingsRepo.allForReview(reviewId);

    await this.container.db.transaction(async (tx) => {
      for (const row of rows) {
        if (row.dismissedAt) continue;
        const comment = await github.postComment(owner, repo, number, row.body);
        await this.container.findingsRepo.markExported(row.id, comment.id, tx);
      }
    });
  }

  async exportPending(owner: string, repo: string, number: number, reviewId: string) {
    const github = await this.container.github();
    const rows = await this.container.findingsRepo.exportableFindings(reviewId);
    for (const row of rows) {
      const comment = await github.postComment(owner, repo, number, row.body);
      await this.container.findingsRepo.markExported(row.id, comment.id);
    }
  }
}
