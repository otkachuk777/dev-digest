import type { Container } from '../../platform/container.js';

export class PullsService {
  constructor(private readonly container: Container) {}

  async page(workspaceId: string, repoId: string, limit?: number, offset?: number) {
    const rows = await this.container.pullsRepo.listPage(workspaceId, repoId, { limit, offset });
    return rows.map((r) => ({ id: r.id, number: r.number, title: r.title, state: r.state }));
  }
}
