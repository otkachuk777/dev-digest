import { z } from 'zod';
import type { Container } from '../../platform/container.js';
import { toFindingDto } from './helpers.js';

const FindingShape = z.object({
  id: z.string().uuid(),
  review_id: z.string().uuid(),
  severity: z.enum(['critical', 'major', 'minor']),
  title: z.string(),
  file: z.string(),
  line: z.number().int(),
  dismissed_at: z.string().nullable(),
});

export class TriageService {
  constructor(private readonly container: Container) {}

  async openFindings(workspaceId: string, reviewId: string) {
    const rows = await this.container.triageRepo.listAll(reviewId);
    const visible = rows.filter((row) => row.workspaceId === workspaceId && row.dismissedAt === null);
    return visible.map((row) => FindingShape.parse(toFindingDto(row)));
  }
}
