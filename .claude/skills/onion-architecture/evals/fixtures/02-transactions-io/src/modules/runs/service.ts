import type { Container } from '../../platform/container.js';
import { AgentsRepository } from '../agents/repository.js';

export class RunsService {
  constructor(private readonly container: Container) {}

  async complete(runId: string, reviewId: string, tokens: number, summary: string) {
    await this.container.db.transaction(async (tx) => {
      const agents = new AgentsRepository(tx as never);
      await agents.completeRun(runId, { tokens, status: 'done' });
      await this.container.reviewRepo.setSummary(reviewId, summary, tx);
    });
  }
}
