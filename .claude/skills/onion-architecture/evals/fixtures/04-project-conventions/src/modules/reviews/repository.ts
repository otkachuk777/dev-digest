import { and, eq } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../db/client.js';
import { findings, reviews } from '../../db/schema.js';
import { NotFoundError } from '../../platform/errors.js';

export type ReviewRow = typeof reviews.$inferSelect;

export class ReviewsRepository {
  constructor(private readonly db: Db) {}

  async getById(workspaceId: string, id: string): Promise<ReviewRow> {
    const rows = await this.db
      .select()
      .from(reviews)
      .where(and(eq(reviews.workspaceId, workspaceId), eq(reviews.id, id)));
    if (!rows[0]) throw new NotFoundError('review');
    return rows[0];
  }

  async findById(workspaceId: string, id: string): Promise<ReviewRow | undefined> {
    const rows = await this.db
      .select()
      .from(reviews)
      .where(and(eq(reviews.workspaceId, workspaceId), eq(reviews.id, id)));
    return rows[0];
  }

  async markFindingsExported(workspaceId: string, reviewId: string, at: Date, tx?: DbExecutor) {
    await (tx ?? this.db)
      .update(findings)
      .set({ exportedAt: at })
      .where(and(eq(findings.workspaceId, workspaceId), eq(findings.reviewId, reviewId)));
  }

  async setStatus(workspaceId: string, id: string, status: string, tx?: DbExecutor) {
    await (tx ?? this.db)
      .update(reviews)
      .set({ status })
      .where(and(eq(reviews.workspaceId, workspaceId), eq(reviews.id, id)));
  }
}
