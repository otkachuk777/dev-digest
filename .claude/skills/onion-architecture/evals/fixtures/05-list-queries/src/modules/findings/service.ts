import type { Container } from '../../platform/container.js';

export class FindingsService {
  constructor(private readonly container: Container) {}

  async recent(workspaceId: string, limit: number) {
    const rows = await this.container.findingsRepo.listRecent(workspaceId, limit);
    return rows.map((r) => ({ id: r.id, title: r.title, severity: r.severity }));
  }
}
