import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { exportRuns, findings } from '../../db/schema.js';

export type ExportRunRow = typeof exportRuns.$inferSelect;

export class ExportsRepository {
  constructor(private readonly db: Db) {}

  async start(reviewId: string, target: string): Promise<ExportRunRow> {
    const rows = await this.db
      .insert(exportRuns)
      .values({ reviewId, target, startedAt: new Date() })
      .returning();
    return rows[0]!;
  }

  async pendingBodies(reviewId: string): Promise<string[]> {
    const rows = await this.db
      .select({ body: findings.body })
      .from(findings)
      .where(eq(findings.reviewId, reviewId));
    return rows.map((r) => r.body);
  }

  async stampFindings(reviewId: string, at: Date) {
    await this.db.update(findings).set({ exportedAt: at }).where(eq(findings.reviewId, reviewId));
  }
}
