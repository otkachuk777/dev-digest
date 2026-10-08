import type { Finding } from '../../vendor/shared/contracts/finding.js';
import type { Container } from '../../platform/container.js';
import { toFindingDto } from '../triage/index.js';

export class ReportsService {
  constructor(private readonly container: Container) {}

  async criticalTitles(workspaceId: string, reviewId: string): Promise<string[]> {
    const rows = await this.container.triageRepo.listActiveBySeverity(workspaceId, reviewId, ['critical']);
    const dtos: Finding[] = rows.map(toFindingDto);
    return dtos.map((d) => d.title);
  }
}
