import type { Container } from '../../platform/container.js';

export class ReportsService {
  constructor(private readonly container: Container) {}

  async topFindings(workspaceId: string, reviewId: string, count: number) {
    const all = await this.container.findingsRepo.listByReview(workspaceId, reviewId);
    return all.slice(0, count).map((r) => ({ id: r.id, title: r.title, severity: r.severity }));
  }
}
