import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface LatestFindingRow {
  agentId: string | null;
  reviewId: string;
  severity: string;
  title: string;
  file: string;
  startLine: number;
}

/**
 * PR Brief SQL. Owns `pr_brief`; reads `findings ⋈ reviews` (read-only) for the brief facts.
 * The stored row is read through `pull_requests` on the workspace, so a foreign PR id reads as absent.
 */
export class BriefRepository {
  constructor(private db: Db) {}

  async getBrief(workspaceId: string, prId: string): Promise<{ json: unknown } | undefined> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prBrief.prId))
      .where(and(eq(t.prBrief.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)))
      .limit(1);
    return row;
  }

  /** Upsert on the PK. `false` when the PR vanished meanwhile (FK violation 23503). */
  async upsertBrief(prId: string, json: unknown): Promise<boolean> {
    try {
      await this.db.insert(t.prBrief).values({ prId, json }).onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
      return true;
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if ((e.code ?? e.cause?.code) === '23503') return false;
      throw err;
    }
  }

  /** Findings of the PR's `review` reviews, newest review first (the caller keeps the latest per agent). */
  latestFindings(prId: string): Promise<LatestFindingRow[]> {
    return this.db
      .select({
        agentId: t.reviews.agentId,
        reviewId: t.findings.reviewId,
        severity: t.findings.severity,
        title: t.findings.title,
        file: t.findings.file,
        startLine: t.findings.startLine,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }
}
