import { and, asc, count, desc, eq, getTableColumns, gte, lte, ne, sql } from 'drizzle-orm';
import type { EvalCaseResult } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalCaseRow, EvalRunRow, FindingRow } from '../../db/rows.js';
import { MAX_CASES_PER_AGENT, RECENT_RUNS, RUN_LIST_LIMIT, TREND_POINTS } from './constants.js';
import type { RunFinish, SuiteRepo } from './executor.js';

export type { EvalCaseRow, EvalRunRow };

export interface FindingForCase {
  finding: FindingRow;
  agentId: string | null;
  prTitle: string;
  prBody: string | null;
  patch: string | null;
}

export type NewCase = Omit<typeof t.evalCases.$inferInsert, 'id' | 'createdAt' | 'updatedAt' | 'lastResult'>;
export type CasePatch = Partial<Pick<typeof t.evalCases.$inferInsert, 'name' | 'expected' | 'inputDiff' | 'inputMeta' | 'lastResult'>>;

/** Postgres unique violation, whether raw or wrapped by drizzle (`cause`). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** Owns `eval_cases`. Every query is scoped by workspace_id. */
export class EvalRepository implements SuiteRepo {
  constructor(private db: Db) {}

  /** Read-only: finding → review → PR, both ends scoped to the workspace (NFR-9). */
  async findingForCase(workspaceId: string, findingId: string): Promise<FindingForCase | undefined> {
    const [row] = await this.db
      .select({
        finding: t.findings,
        agentId: t.reviews.agentId,
        prTitle: t.pullRequests.title,
        prBody: t.pullRequests.body,
        patch: t.prFiles.patch,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
      .leftJoin(t.prFiles, and(eq(t.prFiles.prId, t.pullRequests.id), eq(t.prFiles.path, t.findings.file)))
      .where(
        and(
          eq(t.findings.id, findingId),
          eq(t.reviews.workspaceId, workspaceId),
          eq(t.pullRequests.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    return row;
  }

  listCases(workspaceId: string, agentId: string): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.agentId, agentId)))
      .orderBy(asc(t.evalCases.name))
      .limit(MAX_CASES_PER_AGENT);
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  async caseBySourceFinding(workspaceId: string, agentId: string, findingId: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.agentId, agentId),
          eq(t.evalCases.sourceFindingId, findingId),
        ),
      );
    return row;
  }

  /** Another case of the agent already uses `name` (AC-28). */
  async nameTaken(workspaceId: string, agentId: string, name: string, exceptId?: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.evalCases.id })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.agentId, agentId),
          eq(t.evalCases.name, name),
          ...(exceptId ? [ne(t.evalCases.id, exceptId)] : []),
        ),
      )
      .limit(1);
    return !!row;
  }

  /** null when a unique index (name or source finding) already holds the row — the caller re-reads. */
  async insertCase(values: NewCase): Promise<EvalCaseRow | null> {
    const [row] = await this.db.insert(t.evalCases).values(values).onConflictDoNothing().returning();
    return row ?? null;
  }

  async updateCase(workspaceId: string, id: string, patch: CasePatch): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  async setLastResult(workspaceId: string, id: string, lastResult: unknown): Promise<void> {
    await this.db
      .update(t.evalCases)
      .set({ lastResult })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
  }

  // ---- runs (workspace-scoped; results hang off a run that was found scoped) ----

  async countCases(workspaceId: string, agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.agentId, agentId)));
    return Number(row?.n ?? 0);
  }

  async hasRunningRun(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.evalRuns.id })
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.agentId, agentId), eq(t.evalRuns.status, 'running')))
      .limit(1);
    return !!row;
  }

  /** null when the one-running-per-agent index already holds a row (B1). */
  async insertRun(values: typeof t.evalRuns.$inferInsert): Promise<EvalRunRow | null> {
    const [row] = await this.db.insert(t.evalRuns).values(values).onConflictDoNothing().returning();
    return row ?? null;
  }

  async insertCaseResult(runId: string, c: { caseId: string; caseName: string; result: EvalCaseResult }): Promise<void> {
    const row = { runId, caseName: c.caseName, result: c.result, status: c.result.status };
    try {
      await this.db.insert(t.evalCaseResults).values({ ...row, caseId: c.caseId });
    } catch (err) {
      // The case was deleted mid-run: keep the result by name (case_id null), don't fail the run.
      const e = err as { code?: string; cause?: { code?: string } };
      if (e?.code !== '23503' && e?.cause?.code !== '23503') throw err;
      await this.db.insert(t.evalCaseResults).values({ ...row, caseId: null });
    }
  }

  async bumpCasesDone(runId: string): Promise<void> {
    await this.db.update(t.evalRuns).set({ casesDone: sql`${t.evalRuns.casesDone} + 1` }).where(eq(t.evalRuns.id, runId));
  }

  /** Metrics and the terminal status in ONE update — the last write of a run. */
  async finishRun(runId: string, f: RunFinish): Promise<void> {
    await this.db.update(t.evalRuns).set(f).where(eq(t.evalRuns.id, runId));
  }

  /** Marks this agent's `running` rows older than `cutoff` failed (a final write that never landed, DB blip). */
  async reapStaleForAgent(workspaceId: string, agentId: string, cutoff: Date): Promise<number> {
    const rows = await this.db
      .update(t.evalRuns)
      .set({ status: 'failed', error: 'interrupted', finishedAt: new Date() })
      .where(
        and(
          eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.agentId, agentId),
          eq(t.evalRuns.status, 'running'), lte(t.evalRuns.startedAt, cutoff),
        ),
      )
      .returning({ id: t.evalRuns.id });
    return rows.length;
  }

  /** AC-46: runs a dead process left `running`. Single API instance assumed. */
  async reapInterrupted(): Promise<number> {
    const rows = await this.db
      .update(t.evalRuns)
      .set({ status: 'failed', error: 'interrupted by server restart', finishedAt: new Date() })
      .where(eq(t.evalRuns.status, 'running'))
      .returning({ id: t.evalRuns.id });
    return rows.length;
  }

  listRuns(workspaceId: string, agentId: string, since: Date | null): Promise<EvalRunRow[]> {
    return this.db
      .select()
      .from(t.evalRuns)
      .where(
        and(
          eq(t.evalRuns.workspaceId, workspaceId),
          eq(t.evalRuns.agentId, agentId),
          ...(since ? [gte(t.evalRuns.startedAt, since)] : []),
        ),
      )
      .orderBy(desc(t.evalRuns.startedAt))
      .limit(RUN_LIST_LIMIT);
  }

  async getRun(workspaceId: string, id: string): Promise<EvalRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.id, id)));
    return row;
  }

  runResults(runId: string): Promise<{ result: unknown }[]> {
    return this.db
      .select({ result: t.evalCaseResults.result })
      .from(t.evalCaseResults)
      .where(eq(t.evalCaseResults.runId, runId))
      .orderBy(asc(t.evalCaseResults.caseName))
      .limit(MAX_CASES_PER_AGENT);
  }

  // ---- dashboard: three queries, no per-agent loop (NFR-2) ----

  agentsWithCaseCount(workspaceId: string) {
    return this.db
      .select({
        id: t.agents.id, name: t.agents.name, model: t.agents.model, enabled: t.agents.enabled,
        caseCount: count(t.evalCases.id),
      })
      .from(t.agents)
      .leftJoin(t.evalCases, eq(t.evalCases.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId))
      .groupBy(t.agents.id)
      .orderBy(asc(t.agents.name));
  }

  /** Each agent's newest TREND_POINTS done runs (newest first within an agent). */
  recentDoneRunsPerAgent(workspaceId: string): Promise<EvalRunRow[]> {
    const ranked = this.db
      .select({
        ...getTableColumns(t.evalRuns),
        rn: sql<number>`row_number() over (partition by ${t.evalRuns.agentId} order by ${t.evalRuns.startedAt} desc)`.as('rn'),
      })
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.status, 'done')))
      .as('ranked');
    return this.db.select().from(ranked).where(lte(ranked.rn, TREND_POINTS)).orderBy(desc(ranked.startedAt));
  }

  /** Ids of the workspace's agents that have a `running` suite run. */
  async agentIdsRunning(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ agentId: t.evalRuns.agentId })
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.status, 'running')));
    return rows.map((r) => r.agentId);
  }

  async recentDoneRuns(workspaceId: string): Promise<(EvalRunRow & { agentName: string })[]> {
    const rows = await this.db
      .select({ run: t.evalRuns, agentName: t.agents.name })
      .from(t.evalRuns)
      .innerJoin(t.agents, eq(t.agents.id, t.evalRuns.agentId))
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.status, 'done')))
      .orderBy(desc(t.evalRuns.startedAt))
      .limit(RECENT_RUNS);
    return rows.map((r) => ({ ...r.run, agentName: r.agentName }));
  }
}
