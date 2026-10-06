import { eq } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../db/client.js';
import { reviews } from '../../db/schema.js';

export class ReviewsRepository {
  constructor(private readonly db: Db) {}

  async setSummary(id: string, summary: string, tx?: DbExecutor) {
    await (tx ?? this.db).update(reviews).set({ summary }).where(eq(reviews.id, id));
  }

  async setStatus(id: string, status: string, tx?: DbExecutor) {
    await (tx ?? this.db).update(reviews).set({ status }).where(eq(reviews.id, id));
  }
}
