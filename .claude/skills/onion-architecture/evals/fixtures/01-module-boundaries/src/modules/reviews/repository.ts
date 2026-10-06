import { desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { reviews } from '../../db/schema.js';

export type ReviewRow = typeof reviews.$inferSelect;

export class ReviewsRepository {
  constructor(private readonly db: Db) {}

  async latestForPull(pullId: string): Promise<ReviewRow | undefined> {
    const rows = await this.db
      .select()
      .from(reviews)
      .where(eq(reviews.pullId, pullId))
      .orderBy(desc(reviews.createdAt))
      .limit(1);
    return rows[0];
  }
}
