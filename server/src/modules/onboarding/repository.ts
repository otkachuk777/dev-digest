import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface OnboardingRepoRow {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

/** Onboarding SQL. Every read joins `repos` on the workspace, so a foreign repo id reads as absent. */
export class OnboardingRepository {
  constructor(private db: Db) {}

  async repoInWorkspace(workspaceId: string, repoId: string): Promise<OnboardingRepoRow | undefined> {
    const [row] = await this.db
      .select({
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        defaultBranch: t.repos.defaultBranch,
      })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)))
      .limit(1);
    return row;
  }

  async getTour(workspaceId: string, repoId: string): Promise<{ json: unknown; generatedAt: Date } | undefined> {
    const [row] = await this.db
      .select({ json: t.onboarding.json, generatedAt: t.onboarding.generatedAt })
      .from(t.onboarding)
      .innerJoin(t.repos, eq(t.repos.id, t.onboarding.repoId))
      .where(and(eq(t.onboarding.repoId, repoId), eq(t.repos.workspaceId, workspaceId)))
      .limit(1);
    return row;
  }

  /** Upsert on the PK. `false` when the repo vanished meanwhile (FK violation 23503). */
  async upsertTour(repoId: string, json: unknown, generatedAt: Date): Promise<boolean> {
    try {
      await this.db
        .insert(t.onboarding)
        .values({ repoId, json, generatedAt })
        .onConflictDoUpdate({ target: t.onboarding.repoId, set: { json, generatedAt } });
      return true;
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if ((e.code ?? e.cause?.code) === '23503') return false;
      throw err;
    }
  }
}
