import { and, eq, isNull } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../db/client.js';
import { findings } from '../../db/schema.js';

export class FindingsRepository {
  constructor(private readonly db: Db) {}

  async exportableFindings(reviewId: string) {
    return this.db
      .select()
      .from(findings)
      .where(and(eq(findings.reviewId, reviewId), isNull(findings.dismissedAt), isNull(findings.exportedAt)));
  }

  async allForReview(reviewId: string) {
    return this.db.select().from(findings).where(eq(findings.reviewId, reviewId));
  }

  async markExported(id: string, externalCommentId: string, tx?: DbExecutor) {
    await (tx ?? this.db)
      .update(findings)
      .set({ exportedAt: new Date(), externalCommentId })
      .where(eq(findings.id, id));
  }
}
