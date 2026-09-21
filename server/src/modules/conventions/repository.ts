import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { RepoBasics } from './helpers.js';

/**
 * Conventions data-access. Every query filters on `workspaceId` — including the
 * repo lookup — so a repo or convention id from another workspace reads as absent.
 */
export type ConventionRow = typeof t.conventions.$inferSelect;
export type NewConvention = Omit<typeof t.conventions.$inferInsert, 'id' | 'createdAt'>;

export class ConventionsRepository {
  constructor(private db: Db) {}

  async repoBasics(workspaceId: string, repoId: string): Promise<RepoBasics | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
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

  list(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence));
  }

  async byId(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.id, id), eq(t.conventions.workspaceId, workspaceId)))
      .limit(1);
    return row;
  }

  /** A re-scan REPLACES the repo's previous candidates (accepted state included). */
  async replaceForRepo(workspaceId: string, repoId: string, rows: NewConvention[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
      if (rows.length) await tx.insert(t.conventions).values(rows);
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: { accepted?: boolean; rule?: string },
  ): Promise<ConventionRow | undefined> {
    if (patch.accepted === undefined && patch.rule === undefined) return this.byId(workspaceId, id);
    const [row] = await this.db
      .update(t.conventions)
      .set(patch)
      .where(and(eq(t.conventions.id, id), eq(t.conventions.workspaceId, workspaceId)))
      .returning();
    return row;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.id, id), eq(t.conventions.workspaceId, workspaceId)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }
}
