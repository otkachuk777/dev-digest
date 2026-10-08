import { Octokit } from '@octokit/rest';
import type { Container } from '../../platform/container.js';
import { ReviewsRepository } from '../reviews/repository.js';
import { isStale, toPullDto } from './helpers.js';

export class PullsService {
  private readonly reviews: ReviewsRepository;

  constructor(private readonly container: Container) {
    this.reviews = new ReviewsRepository(container.db);
  }

  async getSummary(repoId: string, number: number) {
    const row = await this.container.pullsRepo.findByNumber(repoId, number);
    if (!row) return null;

    const review = await this.reviews.latestForPull(row.id);
    const octokit = new Octokit({ auth: this.container.secrets.get('GITHUB_TOKEN') });
    const remote = await octokit.pulls.get({ owner: 'acme', repo: 'shop', pull_number: number });

    return {
      ...toPullDto(row),
      stale: isStale(row, new Date()),
      verdict: review?.verdict ?? 'pending',
      headSha: remote.data.head.sha,
    };
  }
}
