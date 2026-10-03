import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface RepoRow {
  id: string;
  owner: string;
  name: string;
}

/**
 * Project Context SQL. Owns `agent_context_docs` / `skill_context_docs`; reads
 * `repos`, `repo_index_state`, `agents`, `skills` for its own read model only.
 * Every owner read joins the owner with `workspace_id` (server/INSIGHTS.md "scope parent AND child").
 */
export class ContextRepository {
  constructor(private db: Db) {}

  async repoInWorkspace(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Last successful repo-intel resync (null when the repo was never indexed). */
  async syncedAt(repoId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: t.repoIndexState.updatedAt })
      .from(t.repoIndexState)
      .where(eq(t.repoIndexState.repoId, repoId));
    return row?.at ?? null;
  }

  /** path → how many in-workspace agents / skills attach it for this repo. */
  async usedByCounts(
    workspaceId: string,
    repoId: string,
  ): Promise<Map<string, { agents: number; skills: number }>> {
    const agentRows = (await this.db.execute(sql`
      select p.path as path, count(distinct a.id)::int as n
      from ${t.agentContextDocs} acd
      join ${t.agents} a on a.id = acd.agent_id
      cross join lateral jsonb_array_elements_text(acd.paths) as p(path)
      where a.workspace_id = ${workspaceId} and acd.repo_id = ${repoId}
      group by p.path`)) as unknown as { path: string; n: number }[];
    const skillRows = (await this.db.execute(sql`
      select p.path as path, count(distinct s.id)::int as n
      from ${t.skillContextDocs} scd
      join ${t.skills} s on s.id = scd.skill_id
      cross join lateral jsonb_array_elements_text(scd.paths) as p(path)
      where s.workspace_id = ${workspaceId} and scd.repo_id = ${repoId}
      group by p.path`)) as unknown as { path: string; n: number }[];
    const out = new Map<string, { agents: number; skills: number }>();
    const slot = (p: string) => {
      let v = out.get(p);
      if (!v) out.set(p, (v = { agents: 0, skills: 0 }));
      return v;
    };
    for (const r of agentRows) slot(r.path).agents = r.n;
    for (const r of skillRows) slot(r.path).skills = r.n;
    return out;
  }

  async agentPaths(workspaceId: string, agentId: string, repoId: string): Promise<string[]> {
    const [row] = await this.db
      .select({ paths: t.agentContextDocs.paths })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agentContextDocs.agentId, t.agents.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agentContextDocs.agentId, agentId),
          eq(t.agentContextDocs.repoId, repoId),
        ),
      );
    return row?.paths ?? [];
  }

  async skillPaths(workspaceId: string, skillId: string, repoId: string): Promise<string[]> {
    return (await this.skillPathsFor(workspaceId, [skillId], repoId)).get(skillId) ?? [];
  }

  /** skillId → stored paths for this repo; only skills of the workspace are ever returned. */
  async skillPathsFor(
    workspaceId: string,
    skillIds: string[],
    repoId: string,
  ): Promise<Map<string, string[]>> {
    if (skillIds.length === 0) return new Map();
    const rows = await this.db
      .select({ skillId: t.skillContextDocs.skillId, paths: t.skillContextDocs.paths })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skillContextDocs.skillId, t.skills.id))
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skillContextDocs.repoId, repoId),
          inArray(t.skillContextDocs.skillId, skillIds),
        ),
      );
    return new Map(rows.map((r) => [r.skillId, r.paths]));
  }

  /** Single upsert — concurrent writers are last-write-wins, no transaction needed. */
  async setAgentPaths(agentId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db
      .insert(t.agentContextDocs)
      .values({ agentId, repoId, paths })
      .onConflictDoUpdate({
        target: [t.agentContextDocs.agentId, t.agentContextDocs.repoId],
        set: { paths, updatedAt: new Date() },
      });
  }

  async setSkillPaths(skillId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db
      .insert(t.skillContextDocs)
      .values({ skillId, repoId, paths })
      .onConflictDoUpdate({
        target: [t.skillContextDocs.skillId, t.skillContextDocs.repoId],
        set: { paths, updatedAt: new Date() },
      });
  }
}
