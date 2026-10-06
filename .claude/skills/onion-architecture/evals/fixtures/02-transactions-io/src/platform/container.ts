import type { Db } from '../db/client.js';
import type { GithubPort, JobsPort } from '../vendor/shared/adapters.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { FindingsRepository } from '../modules/findings/repository.js';
import { ReviewsRepository } from '../modules/reviews/repository.js';
import { GithubAdapter } from '../adapters/github/index.js';

export class Container {
  readonly agentsRepo: AgentsRepository;
  readonly findingsRepo: FindingsRepository;
  readonly reviewRepo: ReviewsRepository;
  private githubPort?: GithubPort;

  constructor(readonly db: Db, readonly jobs: JobsPort, private readonly token: string) {
    this.agentsRepo = new AgentsRepository(db);
    this.findingsRepo = new FindingsRepository(db);
    this.reviewRepo = new ReviewsRepository(db);
  }

  async github(): Promise<GithubPort> {
    this.githubPort ??= new GithubAdapter(this.token);
    return this.githubPort;
  }
}
