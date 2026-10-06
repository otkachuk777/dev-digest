import type { Db } from '../db/client.js';
import type { GithubPort, SecretsPort } from '../vendor/shared/adapters.js';
import { ReviewsRepository } from '../modules/reviews/repository.js';
import { PullsRepository } from '../modules/pulls/repository.js';
import { GithubAdapter } from '../adapters/github/index.js';

export class Container {
  readonly reviewRepo: ReviewsRepository;
  readonly pullsRepo: PullsRepository;
  private githubPort?: GithubPort;

  constructor(readonly db: Db, readonly secrets: SecretsPort) {
    this.reviewRepo = new ReviewsRepository(db);
    this.pullsRepo = new PullsRepository(db);
  }

  async github(): Promise<GithubPort> {
    this.githubPort ??= new GithubAdapter(this.secrets.get('GITHUB_TOKEN') ?? '');
    return this.githubPort;
  }
}
