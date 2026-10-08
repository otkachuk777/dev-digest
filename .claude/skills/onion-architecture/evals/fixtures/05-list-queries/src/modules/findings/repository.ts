import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { findings } from '../../db/schema.js';

export type FindingRow = typeof findings.$inferSelect;

export class FindingsRepository {
  constructor(private readonly db: Db) {}

  async listByReview(workspaceId: string, reviewId: string): Promise<FindingRow[]> {
    return this.db
      .select()
      .from(findings)
      .where(and(eq(findings.workspaceId, workspaceId), eq(findings.reviewId, reviewId)))
      .orderBy(desc(findings.createdAt));
  }

  async listRecent(workspaceId: string, limit: number): Promise<FindingRow[]> {
    return this.db
      .select()
      .from(findings)
      .where(eq(findings.workspaceId, workspaceId))
      .orderBy(desc(findings.createdAt))
      .limit(limit);
  }
}
