import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { pulls } from '../../db/schema.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants.js';

export type PullRow = typeof pulls.$inferSelect;

export class PullsRepository {
  constructor(private readonly db: Db) {}

  async listPage(
    workspaceId: string,
    repoId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<PullRow[]> {
    const limit = Math.min(opts.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    return this.db
      .select()
      .from(pulls)
      .where(and(eq(pulls.workspaceId, workspaceId), eq(pulls.repoId, repoId)))
      .orderBy(desc(pulls.updatedAt))
      .limit(limit)
      .offset(opts.offset ?? 0);
  }
}
