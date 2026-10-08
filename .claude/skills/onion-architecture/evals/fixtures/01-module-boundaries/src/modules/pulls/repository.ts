import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { pulls } from '../../db/schema.js';

export type PullRow = typeof pulls.$inferSelect;

export class PullsRepository {
  constructor(private readonly db: Db) {}

  async findByNumber(repoId: string, number: number): Promise<PullRow | undefined> {
    const rows = await this.db
      .select()
      .from(pulls)
      .where(and(eq(pulls.repoId, repoId), eq(pulls.number, number)));
    return rows[0];
  }

  async listOpen(repoId: string): Promise<PullRow[]> {
    return this.db
      .select()
      .from(pulls)
      .where(and(eq(pulls.repoId, repoId), eq(pulls.state, 'open')));
  }
}
