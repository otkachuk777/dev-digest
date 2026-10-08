import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { findings } from '../../db/schema.js';
import type { Severity } from '../../vendor/shared/contracts/finding.js';

export type FindingRow = typeof findings.$inferSelect;

export class TriageRepository {
  constructor(private readonly db: Db) {}

  async listAll(reviewId: string): Promise<FindingRow[]> {
    return this.db.select().from(findings).where(eq(findings.reviewId, reviewId));
  }

  async listActive(workspaceId: string, reviewId: string): Promise<FindingRow[]> {
    return this.db.select().from(findings).where(this.activeWhere(workspaceId, reviewId));
  }

  async listActiveBySeverity(
    workspaceId: string,
    reviewId: string,
    severities: Severity[],
  ): Promise<FindingRow[]> {
    return this.db
      .select()
      .from(findings)
      .where(and(this.activeWhere(workspaceId, reviewId), inArray(findings.severity, severities)));
  }

  private activeWhere(workspaceId: string, reviewId: string) {
    return and(
      eq(findings.workspaceId, workspaceId),
      eq(findings.reviewId, reviewId),
      isNull(findings.dismissedAt),
    );
  }
}
