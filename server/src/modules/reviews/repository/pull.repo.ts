import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { IntentConfidence, IntentSource } from '@devdigest/shared';
import type { PullRow, PrIntentRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export interface UpsertIntentInput {
  summary: string;
  inScope: string[];
  outOfScope: string[];
  headSha: string;
  model: string;
  confidence: IntentConfidence;
  sources: IntentSource[];
  missingContext: string[];
}

export async function upsertIntent(db: Db, prId: string, intent: UpsertIntentInput): Promise<void> {
  const values = {
    prId,
    summary: intent.summary,
    inScope: intent.inScope,
    outOfScope: intent.outOfScope,
    headSha: intent.headSha,
    model: intent.model,
    confidence: intent.confidence,
    sources: intent.sources,
    missingContext: intent.missingContext,
  };
  await db
    .insert(t.prIntent)
    .values(values)
    .onConflictDoUpdate({ target: t.prIntent.prId, set: { ...values, createdAt: new Date() } });
}

export async function getIntent(db: Db, prId: string): Promise<PrIntentRow | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  return row;
}
