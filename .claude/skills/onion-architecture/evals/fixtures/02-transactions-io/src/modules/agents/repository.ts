import { eq } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../db/client.js';
import { agentRuns } from '../../db/schema.js';

export class AgentsRepository {
  constructor(private readonly db: Db) {}

  async completeRun(id: string, patch: { tokens: number; status: string }, tx?: DbExecutor) {
    await (tx ?? this.db)
      .update(agentRuns)
      .set({ ...patch, finishedAt: new Date() })
      .where(eq(agentRuns.id, id));
  }

  async createRun(agentId: string) {
    const rows = await this.db
      .insert(agentRuns)
      .values({ agentId, status: 'running' })
      .returning();
    return rows[0]!;
  }
}
