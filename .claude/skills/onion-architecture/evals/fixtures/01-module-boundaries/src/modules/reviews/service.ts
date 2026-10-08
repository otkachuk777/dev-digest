import type { Container } from '../../platform/container.js';

export class ReviewsService {
  constructor(private readonly container: Container) {}

  async verdictFor(pullId: string) {
    const review = await this.container.reviewRepo.latestForPull(pullId);
    return review ? review.verdict : 'pending';
  }

  async changedFiles(owner: string, repo: string, number: number) {
    const github = await this.container.github();
    return github.listChangedFiles(owner, repo, number);
  }
}
