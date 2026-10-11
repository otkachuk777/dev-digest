/**
 * SPEC-04 eval cases — create from a finding, hand-made cases, edit, delete.
 * Postgres via Testcontainers; skips cleanly without Docker.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { EvalCase, EvalCaseResult, EvalDashboard, EvalRunAllResult, EvalRunDetail, EvalRunRecord } from '@devdigest/shared';
import { MockLLMProvider, type MockLLMOptions } from '../src/adapters/mocks.js';
import { EvalService } from '../src/modules/eval/service.js';

const hasDocker = await dockerAvailable();
if (!hasDocker && process.env.EVAL_REQUIRE_DOCKER) throw new Error('verify:l06 requires Docker');
const d = hasDocker ? describe : describe.skip;

const PATCH = '@@ -1,2 +10,3 @@\n a\n+b\n c';
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Mock whose review call can be held at a gate; `opts.structured` is swapped per test. */
class GatedLLM extends MockLLMProvider {
  gate: Promise<void> | null = null;
  constructor(id: 'openai' | 'anthropic' | 'openrouter', public o: MockLLMOptions) {
    super(id, o);
  }
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
    if (this.gate) await this.gate;
    return super.completeStructured(req) as Promise<never>;
  }
}
const REVIEW = (findings: unknown[]) => ({ verdict: 'comment', summary: 's', score: 80, findings });
const HIT = {
  id: 'f1', severity: 'CRITICAL', category: 'security', title: 'Hit', file: 'src/a.ts', start_line: 11, end_line: 11,
  rationale: 'r', confidence: 0.9,
};
const noKeys = { get: async () => undefined };

d('eval cases (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let noKeyApp: Awaited<ReturnType<typeof buildApp>>;
  let ws: string;
  const openai = new GatedLLM('openai', { structured: REVIEW([HIT]) });
  let seq = 0;
  const db = () => pg.handle.db;

  beforeAll(async () => {
    pg = await startPg();
    await seed(db());
    [{ id: ws }] = (await db().select().from(t.workspaces)) as [{ id: string }];
    // All three providers mocked (openrouter defaults to the real API otherwise — server/INSIGHTS.md).
    app = await buildApp({
      config: config(),
      db: db(),
      overrides: {
        secrets: noKeys,
        llm: { openai, anthropic: new MockLLMProvider('anthropic'), openrouter: new MockLLMProvider('openrouter') },
      },
    });
    noKeyApp = await buildApp({ config: config(), db: db(), overrides: { secrets: noKeys } });
  });
  afterAll(async () => {
    await noKeyApp?.close();
    await app?.close();
    await pg?.stop();
  });

  async function mkAgent(workspaceId = ws) {
    const [a] = await db()
      .insert(t.agents)
      .values({ workspaceId, name: `agent-${seq++}`, provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning();
    return a!;
  }

  /** A fresh agent + PR (+ stored patch) + review + one finding. */
  async function mkFinding(
    o: { decided?: 'accepted' | 'dismissed' | null; patch?: string | null; agent?: boolean; workspaceId?: string; start?: number; end?: number } = {},
  ) {
    const workspaceId = o.workspaceId ?? ws;
    const n = seq++;
    const agent = await mkAgent(workspaceId);
    const [repo] = await db().insert(t.repos).values({ workspaceId, owner: 'acme', name: `r${n}`, fullName: `acme/r${n}` }).returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({ workspaceId, repoId: repo!.id, number: 1, title: 'PR title', body: 'PR body', author: 'a', branch: 'b', base: 'main', headSha: 'x' })
      .returning();
    if (o.patch !== null) await db().insert(t.prFiles).values({ prId: pr!.id, path: 'src/a.ts', patch: o.patch ?? PATCH });
    const [review] = await db()
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, agentId: o.agent === false ? null : agent.id, kind: 'review' })
      .returning();
    const decided = o.decided === undefined ? 'accepted' : o.decided;
    const [finding] = await db()
      .insert(t.findings)
      .values({
        reviewId: review!.id, file: 'src/a.ts', startLine: o.start ?? 11, endLine: o.end ?? 11, severity: 'CRITICAL',
        category: 'security', title: 'SQL injection', rationale: 'r', confidence: 0.9,
        acceptedAt: decided === 'accepted' ? new Date() : null,
        dismissedAt: decided === 'dismissed' ? new Date() : null,
      })
      .returning();
    return { agent, repo: repo!, pr: pr!, review: review!, finding: finding! };
  }

  const post = (finding: string) => app.inject({ method: 'POST', url: `/findings/${finding}/eval-case` });
  const caseBody = (over: Record<string, unknown> = {}) => ({
    name: `case-${seq++}`,
    expected: [{ file: 'src/a.ts', start_line: 10, end_line: 12 }],
    input_diff: `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n${PATCH}`,
    input_meta: { title: 't', body: 'b' },
    ...over,
  });
  const create = (agentId: string, over: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url: `/agents/${agentId}/eval-cases`, payload: caseBody(over) });

  it('AC-4: an accepted finding becomes a must_find case', async () => {
    const { finding, agent } = await mkFinding();
    const res = await post(finding.id);
    expect(res.statusCode).toBe(201);
    const { case: c, created } = res.json() as { case: EvalCase; created: boolean };
    expect(created).toBe(true);
    expect(c).toMatchObject({
      agent_id: agent.id, name: 'must-find-sql-injection', expectation_type: 'must_find',
      source_finding_id: finding.id, source_decision: 'accepted', last_result: null,
      input_meta: { title: 'PR title', body: 'PR body' },
      expected: [{ file: 'src/a.ts', start_line: 11, end_line: 11, severity: 'CRITICAL', category: 'security', title: 'SQL injection' }],
    });
  });

  it('AC-5: a dismissed finding becomes a must_not_flag case', async () => {
    const { finding } = await mkFinding({ decided: 'dismissed' });
    const c = ((await post(finding.id)).json() as { case: EvalCase }).case;
    expect(c).toMatchObject({ name: 'no-sql-injection', expectation_type: 'must_not_flag', source_decision: 'dismissed' });
  });

  it('AC-6 / EC-5: the frozen input survives deleting the PR files and the PR', async () => {
    const { finding, pr } = await mkFinding();
    const first = ((await post(finding.id)).json() as { case: EvalCase }).case;
    expect(first.input_diff).toBe(`diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n${PATCH}`);
    await db().delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
    await db().delete(t.pullRequests).where(eq(t.pullRequests.id, pr.id));
    const list = (await app.inject({ method: 'GET', url: `/agents/${first.agent_id}/eval-cases` })).json() as EvalCase[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ input_diff: first.input_diff, input_meta: { title: 'PR title', body: 'PR body' } });
  });

  it('AC-8 / EC-1 / EC-4: two parallel POSTs make one case; a flipped decision keeps the type', async () => {
    const { finding } = await mkFinding();
    const [a, b] = await Promise.all([post(finding.id), post(finding.id)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    const [ca, cb] = [a, b].map((r) => (r.json() as { case: EvalCase }).case);
    expect(ca!.id).toBe(cb!.id);
    await db().update(t.findings).set({ acceptedAt: null, dismissedAt: new Date() }).where(eq(t.findings.id, finding.id));
    const again = await post(finding.id);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ created: false, case: { id: ca!.id, expectation_type: 'must_find' } });
  });

  it('AC-10: no stored patch, or a range outside every hunk → 409 finding_not_in_diff', async () => {
    const noPatch = await mkFinding({ patch: null });
    const outside = await mkFinding({ start: 99, end: 99 });
    for (const f of [noPatch, outside]) {
      const res = await post(f.finding.id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('finding_not_in_diff');
    }
  });

  it('AC-11: a review without an agent, or a deleted agent → 409 agent_missing', async () => {
    const noAgent = await mkFinding({ agent: false });
    const gone = await mkFinding();
    await db().delete(t.agents).where(eq(t.agents.id, gone.agent.id));
    for (const f of [noAgent, gone]) {
      const res = await post(f.finding.id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('agent_missing');
    }
  });

  it('AC-12 / NFR-9: unknown id and another workspace\'s finding → 404', async () => {
    expect((await post('00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    const [other] = await db().insert(t.workspaces).values({ name: 'other' }).returning();
    const foreign = await mkFinding({ workspaceId: other!.id });
    expect((await post(foreign.finding.id)).statusCode).toBe(404);
    // A foreign case / agent is just as invisible.
    const c = await app.inject({ method: 'POST', url: `/agents/${foreign.agent.id}/eval-cases`, payload: caseBody() });
    expect(c.statusCode).toBe(404);
    const [fc] = await db()
      .insert(t.evalCases)
      .values({ workspaceId: other!.id, agentId: foreign.agent.id, name: 'x', expectationType: 'must_find', expected: [], inputDiff: 'd', inputMeta: {} })
      .returning();
    expect((await app.inject({ method: 'PUT', url: `/eval-cases/${fc!.id}`, payload: caseBody() })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${fc!.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/agents/${foreign.agent.id}/eval-cases` })).statusCode).toBe(404);
  });

  it('AC-13: an undecided finding → 409 finding_undecided', async () => {
    const { finding } = await mkFinding({ decided: null });
    const res = await post(finding.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('finding_undecided');
  });

  it('AC-14: a patch over 200 KB → 422 case_input_too_large, no case', async () => {
    const big = `@@ -1,1 +1,2 @@\n a\n+${'x'.repeat(210 * 1024)}`;
    const { finding, agent } = await mkFinding({ patch: big, start: 1, end: 2 });
    const res = await post(finding.id);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('case_input_too_large');
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id))).toHaveLength(0);
  });

  it('AC-27: each invalid input → 400 invalid_eval_case naming the field', async () => {
    const { id } = await mkAgent();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ name: '' }, 'name'],
      [{ input_diff: 'not a diff' }, 'input_diff'],
      [{ expected: [] }, 'expected'],
      [{ expected: [{ file: 'src/other.ts', start_line: 10, end_line: 12 }] }, 'expected'],
      [{ expected: [{ file: 'src/a.ts', start_line: 0, end_line: 12 }] }, 'expected'],
      [{ expected: [{ file: 'src/a.ts', start_line: 12, end_line: 10 }] }, 'expected'],
      [{ expected: [{ file: 'src/a.ts', start_line: 50, end_line: 60 }] }, 'expected'],
      [{ input_meta: { title: 't'.repeat(301), body: '' } }, 'input_meta.title'],
    ];
    for (const [over, field] of cases) {
      const res = await create(id, over);
      expect(res.statusCode, JSON.stringify(over)).toBe(400);
      const err = res.json().error;
      expect(err.code).toBe('invalid_eval_case');
      expect(err.details.field.startsWith(field), `${err.details.field} for ${JSON.stringify(over)}`).toBe(true);
    }
  });

  it('AC-28 / EC-6: duplicate name per agent → 409; the same name on another agent is fine', async () => {
    const a = await mkAgent();
    const b = await mkAgent();
    expect((await create(a.id, { name: 'dup' })).statusCode).toBe(201);
    const dup = await create(a.id, { name: 'dup' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('duplicate_case_name');
    expect((await create(b.id, { name: 'dup' })).statusCode).toBe(201);
  });

  it('EC-7: the 51st case → 409 case_limit_reached', async () => {
    const { id } = await mkAgent();
    await db().insert(t.evalCases).values(
      Array.from({ length: 50 }, (_, i) => ({
        workspaceId: ws, agentId: id, name: `c${i}`, expectationType: 'must_find' as const, expected: [], inputDiff: 'd', inputMeta: {},
      })),
    );
    const res = await create(id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('case_limit_reached');
  });

  it('AC-33: deleting a case keeps past results by name', async () => {
    const { id: agentId } = await mkAgent();
    const c = (await create(agentId)).json() as EvalCase;
    const [run] = await db()
      .insert(t.evalRuns)
      .values({ workspaceId: ws, agentId, agentVersion: 1, status: 'done', config: {} })
      .returning();
    await db().insert(t.evalCaseResults).values({ runId: run!.id, caseId: c.id, caseName: c.name, result: {}, status: 'pass' });
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).statusCode).toBe(204);
    const [res] = await db().select().from(t.evalCaseResults).where(eq(t.evalCaseResults.runId, run!.id));
    expect(res).toMatchObject({ caseId: null, caseName: c.name });
  });

  it('AC-34 / AC-35: a content edit clears last_result, a rename does not; the type never changes', async () => {
    const { id: agentId } = await mkAgent();
    const c = (await create(agentId, { expectation_type: 'must_find' })).json() as EvalCase;
    await db().update(t.evalCases).set({ lastResult: { status: 'pass' } }).where(eq(t.evalCases.id, c.id));
    const put = (over: Record<string, unknown>) =>
      app.inject({ method: 'PUT', url: `/eval-cases/${c.id}`, payload: { ...caseBody(over), name: c.name, input_diff: c.input_diff, ...over } });

    const same = await put({ expectation_type: 'must_not_flag' });
    expect(same.statusCode).toBe(200);
    expect(same.json()).toMatchObject({ expectation_type: 'must_find', last_result: { status: 'pass' } });

    const edited = await put({ input_meta: { title: 'new', body: 'b' } });
    expect(edited.json()).toMatchObject({ last_result: null, input_meta: { title: 'new' } });
  });

  it('AC-28: renaming onto another case of the agent → 409', async () => {
    const { id: agentId } = await mkAgent();
    await create(agentId, { name: 'one' });
    const two = (await create(agentId, { name: 'two' })).json() as EvalCase;
    const res = await app.inject({ method: 'PUT', url: `/eval-cases/${two.id}`, payload: caseBody({ name: 'one' }) });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('duplicate_case_name');
  });

  // ======================================================= runs (Step 5) ===

  const mkCase = async (agentId: string, name: string, type: 'must_find' | 'must_not_flag' = 'must_find') => {
    const res = await create(agentId, { name, expectation_type: type });
    expect(res.statusCode).toBe(201);
    return res.json() as EvalCase;
  };
  const startRun = (agentId: string, a = app) => a.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
  const getRun = async (id: string) => (await app.inject({ method: 'GET', url: `/eval-runs/${id}` })).json() as EvalRunDetail;
  const untilDone = async (id: string) => {
    for (let i = 0; i < 100; i++) {
      const r = await getRun(id);
      if (r.status !== 'running') return r;
      await new Promise((ok) => setTimeout(ok, 50));
    }
    throw new Error('run did not finish');
  };
  const hold = () => {
    let release!: () => void;
    openai.gate = new Promise<void>((ok) => (release = ok));
    return () => {
      openai.gate = null;
      release();
    };
  };

  it('AC-36 / AC-39 / AC-41: 202 before any case finishes; metrics match; last_result set; status last', async () => {
    const agent = await mkAgent();
    const hit = await mkCase(agent.id, 'a-hit');
    const clean = await mkCase(agent.id, 'b-clean', 'must_not_flag');
    const release = hold();
    const res = await startRun(agent.id);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'running', total: 2, cases_done: 0, agent_version: agent.version });
    release();
    const run = await untilDone(res.json().id);
    expect(run).toMatchObject({ status: 'done', cases_done: 2, passed: 1, errored: 0, recall: 1, precision: 0.5, citation_accuracy: 1 });
    expect(run.finished_at).not.toBeNull();
    expect(run.results.map((r) => [r.case_name, r.status])).toEqual([['a-hit', 'pass'], ['b-clean', 'fail']]);
    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json() as EvalCase[];
    expect(list.find((c) => c.id === hit.id)!.last_result).toMatchObject({ status: 'pass' });
    expect(list.find((c) => c.id === clean.id)!.last_result).toMatchObject({ status: 'fail' });
  });

  it('F1: dashboard row reports running:true while a run is in flight and false after', async () => {
    const agent = await mkAgent();
    await mkCase(agent.id, 'c1');
    const row = async () =>
      ((await app.inject({ method: 'GET', url: '/eval/dashboard' })).json() as EvalDashboard).agents.find((a) => a.agent_id === agent.id)!;
    expect((await row()).running).toBe(false);
    const release = hold();
    const res = await startRun(agent.id);
    expect(res.statusCode).toBe(202);
    expect((await row()).running).toBe(true);
    release();
    await untilDone(res.json().id);
    expect((await row()).running).toBe(false);
  });

  it('AC-37 / EC-9: editing the agent and a skill mid-run leaves the stored config and the prompt unchanged', async () => {
    const agent = await mkAgent();
    await mkCase(agent.id, 'c1');
    const mk = async (name: string, over: object = {}) =>
      (await db().insert(t.skills).values({ workspaceId: ws, name, description: 'd', type: 'custom', source: 'manual', body: `OLD-${name}`, ...over }).returning())[0]!;
    const on = await mk('on-skill');
    const off = await mk('off-skill', { enabled: false });
    await db().insert(t.agentSkills).values([{ agentId: agent.id, skillId: on.id, order: 0 }, { agentId: agent.id, skillId: off.id, order: 1 }]);
    const release = hold();
    const before = openai.calls.length;
    const res = await startRun(agent.id);
    await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'NEW-PROMPT' } });
    await db().update(t.skills).set({ body: 'NEW-BODY' }).where(eq(t.skills.id, on.id));
    release();
    const run = await untilDone(res.json().id);
    expect(run.config.system_prompt).toBe('p');
    expect(run.config.skills).toEqual([{ skill_id: on.id, name: 'on-skill', version: 1, body: 'OLD-on-skill' }]);
    expect(run.agent_version).toBe(agent.version);
    const prompt = JSON.stringify(openai.calls.slice(before));
    expect(prompt).toContain('OLD-on-skill');
    expect(prompt).not.toContain('NEW-BODY');
    expect(prompt).not.toContain('OLD-off-skill');
    const [stored] = await db().select().from(t.evalRuns).where(eq(t.evalRuns.id, run.id));
    expect((stored!.config as { skills: { source: string }[] }).skills[0]!.source).toBe('manual');
  });

  it('a case deleted mid-run keeps its result by name (case_id null) and the run still ends done', async () => {
    const agent = await mkAgent();
    await mkCase(agent.id, 'a-stays');
    const gone = await mkCase(agent.id, 'b-gone');
    const release = hold();
    const res = await startRun(agent.id);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${gone.id}` })).statusCode).toBeLessThan(300);
    release();
    const run = await untilDone(res.json().id);
    expect(run).toMatchObject({ status: 'done', cases_done: 2 });
    expect(run.results.map((r) => r.case_name)).toEqual(['a-stays', 'b-gone']);
    const rows = await db().select().from(t.evalCaseResults).where(eq(t.evalCaseResults.runId, run.id));
    expect(rows.find((r) => r.caseName === 'b-gone')!.caseId).toBeNull();
  });

  it('AC-42: a second start and a single-case run during a suite → 409 eval_run_in_progress', async () => {
    const agent = await mkAgent();
    const c = await mkCase(agent.id, 'c1');
    const release = hold();
    const first = await startRun(agent.id);
    for (const res of [await startRun(agent.id), await app.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` })]) {
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('eval_run_in_progress');
    }
    release();
    await untilDone(first.json().id);
    expect((await startRun(agent.id)).statusCode).toBe(202);
  });

  it('amendment 3: a running agent without an API key gets 409 eval_run_in_progress, not no_api_key', async () => {
    const agent = await mkAgent();
    await mkCase(agent.id, 'c1');
    await db().insert(t.evalRuns).values({ workspaceId: ws, agentId: agent.id, agentVersion: 1, config: {}, total: 1 });
    const res = await startRun(agent.id, noKeyApp);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('eval_run_in_progress');
  });

  it('AC-43 / AC-44: no cases → 409 no_eval_cases; no key → 400 no_api_key and no run row', async () => {
    const agent = await mkAgent();
    const none = await startRun(agent.id);
    expect(none.statusCode).toBe(409);
    expect(none.json().error.code).toBe('no_eval_cases');
    await mkCase(agent.id, 'c1');
    const calls = openai.calls.length;
    const res = await startRun(agent.id, noKeyApp);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('no_api_key');
    expect(openai.calls.length).toBe(calls);
    expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);
    const c = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json() as EvalCase[];
    expect((await noKeyApp.inject({ method: 'POST', url: `/eval-cases/${c[0]!.id}/run` })).json().error.code).toBe('no_api_key');
  });

  it('AC-46: reapInterrupted marks running runs failed with a reason', async () => {
    const agent = await mkAgent();
    const [row] = await db().insert(t.evalRuns).values({ workspaceId: ws, agentId: agent.id, agentVersion: 1, config: {}, total: 1 }).returning();
    expect(await new EvalService(app.container).reapInterrupted()).toBeGreaterThanOrEqual(1);
    const [after] = await db().select().from(t.evalRuns).where(eq(t.evalRuns.id, row!.id));
    expect(after).toMatchObject({ status: 'failed', error: 'interrupted by server restart' });
    expect(after!.finishedAt).not.toBeNull();
  });

  it('AC-30: a single-case run sets last_result and creates no run', async () => {
    const agent = await mkAgent();
    const c = await mkCase(agent.id, 'c1');
    const res = await app.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ case_id: c.id, status: 'pass' });
    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json() as EvalCase[];
    expect(list[0]!.last_result).toMatchObject({ status: 'pass' });
    expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);
    expect((await app.inject({ method: 'POST', url: '/eval-cases/00000000-0000-4000-8000-000000000000/run' })).statusCode).toBe(404);
  });

  it('EC-10: every case erroring → run failed with "all cases errored"', async () => {
    const agent = await mkAgent();
    await mkCase(agent.id, 'c1');
    openai.o.structured = { not: 'a review' };
    try {
      const run = await untilDone((await startRun(agent.id)).json().id);
      expect(run).toMatchObject({ status: 'failed', error: 'all cases errored', errored: 1, recall: null });
      expect(run.results[0]).toMatchObject({ status: 'error' });
    } finally {
      openai.o.structured = REVIEW([HIT]);
    }
  });

  it('AC-50: deleting the agent removes its cases, runs and results', async () => {
    const agent = await mkAgent();
    await mkCase(agent.id, 'c1');
    const run = await untilDone((await startRun(agent.id)).json().id);
    expect(run.results).toHaveLength(1);
    await db().delete(t.agents).where(eq(t.agents.id, agent.id));
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id))).toHaveLength(0);
    expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);
    expect(await db().select().from(t.evalCaseResults).where(eq(t.evalCaseResults.runId, run.id))).toHaveLength(0);
  });

  // ============================================ reads, run-all, promote (Step 6) ===

  it('AC-61: range filter and invalid_range', async () => {
    const agent = await mkAgent();
    const day = 86_400_000;
    const at = (ago: number) => ({ workspaceId: ws, agentId: agent.id, agentVersion: 1, status: 'done' as const, config: {}, startedAt: new Date(Date.now() - ago * day) });
    await db().insert(t.evalRuns).values([at(10), at(40), at(100)]);
    const count = async (q: string) => ((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs${q}` })).json() as EvalRunRecord[]).length;
    expect(await count('')).toBe(1); // default 30d
    expect(await count('?range=7d')).toBe(0);
    expect(await count('?range=30d')).toBe(1);
    expect(await count('?range=90d')).toBe(2);
    expect(await count('?range=all')).toBe(3);
    const bad = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs?range=1y` });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('invalid_range');
  });

  it('NFR-9: run detail, history and promote answer 404 for another workspace', async () => {
    const [other] = await db().insert(t.workspaces).values({ name: 'other-runs' }).returning();
    const foreign = await mkAgent(other!.id);
    const [run] = await db().insert(t.evalRuns).values({ workspaceId: other!.id, agentId: foreign.id, agentVersion: 1, status: 'done', config: {} }).returning();
    for (const [method, url] of [['GET', `/eval-runs/${run!.id}`], ['POST', `/eval-runs/${run!.id}/promote`], ['GET', `/agents/${foreign.id}/eval-runs`], ['POST', `/agents/${foreign.id}/eval-runs`]] as const) {
      expect((await app.inject({ method, url })).statusCode, url).toBe(404);
    }
  });

  it('AC-69 / AC-70: promote applies the run config (version +1, skills kept); already_current and run_not_done → 409', async () => {
    const agent = await mkAgent();
    await mkCase(agent.id, 'c1');
    const [skill] = await db().insert(t.skills).values({ workspaceId: ws, name: 'sk', description: 'd', type: 'custom', source: 'manual', body: 'b' }).returning();
    await db().insert(t.agentSkills).values({ agentId: agent.id, skillId: skill!.id });
    const run = await untilDone((await startRun(agent.id)).json().id);
    const promote = () => app.inject({ method: 'POST', url: `/eval-runs/${run.id}/promote` });
    expect((await promote()).json().error.code).toBe('already_current');
    await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { system_prompt: 'changed', model: 'm2' } });
    const res = await promote();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: agent.id, system_prompt: 'p', model: 'm', version: agent.version + 2, skill_count: 1 });
    const [running] = await db().insert(t.evalRuns).values({ workspaceId: ws, agentId: agent.id, agentVersion: 1, status: 'failed', config: {} }).returning();
    const nd = await app.inject({ method: 'POST', url: `/eval-runs/${running!.id}/promote` });
    expect(nd.statusCode).toBe(409);
    expect(nd.json().error.code).toBe('run_not_done');
  });

  it('AC-47 / EC-12 / AC-72: run-all starts ready agents and skips disabled, empty and busy ones; dashboard shape', async () => {
    await db().delete(t.evalRuns);
    await db().delete(t.evalCases);
    const ready = await mkAgent();
    const empty = await mkAgent();
    const busy = await mkAgent();
    const [off] = await db().insert(t.agents).values({ workspaceId: ws, name: `off-${seq++}`, provider: 'openai', model: 'm', systemPrompt: 'p', enabled: false }).returning();
    for (const a of [ready, busy, off!]) await mkCase(a.id, 'c1');
    await db().insert(t.evalRuns).values({ workspaceId: ws, agentId: busy.id, agentVersion: 1, config: {}, total: 1 });
    // 12 older done runs for `ready`: the trend must stay at 10.
    await db().insert(t.evalRuns).values(Array.from({ length: 12 }, (_, i) => ({
      workspaceId: ws, agentId: ready.id, agentVersion: 1, status: 'done' as const, config: {}, recall: 0.5,
      startedAt: new Date(Date.now() - (i + 1) * 3_600_000),
    })));
    const res = await app.inject({ method: 'POST', url: '/eval/run-all' });
    expect(res.statusCode).toBe(202);
    const body = res.json() as EvalRunAllResult;
    expect(body.started.map((r) => r.agent_id)).toEqual([ready.id]);
    const skip = Object.fromEntries(body.skipped.map((x) => [x.agent_id, x.reason]));
    expect(skip).toMatchObject({ [empty.id]: 'no_eval_cases', [busy.id]: 'eval_run_in_progress', [off!.id]: 'disabled' });
    await untilDone(body.started[0]!.id);

    const dash = (await app.inject({ method: 'GET', url: '/eval/dashboard' })).json() as EvalDashboard;
    const row = dash.agents.find((a) => a.agent_id === ready.id)!;
    expect(row).toMatchObject({ case_count: 1, latest: { recall: 1, status: 'done' } });
    expect(row.recall_trend).toHaveLength(10);
    expect(row.recall_trend.at(-1)).toBe(1);
    expect(dash.agents.find((a) => a.agent_id === empty.id)).toMatchObject({ case_count: 0, latest: null, recall_trend: [] });
    expect(dash.recent_runs).toHaveLength(6);
    expect(dash.recent_runs.every((r) => r.status === 'done')).toBe(true);
    expect(dash.recent_runs[0]).toMatchObject({ id: body.started[0]!.id, agent_name: ready.name });
  });

  it('F5: a stale running row is reaped on start; a fresh one still blocks', async () => {
    const agent = await mkAgent();
    await mkCase(agent.id, 'c1');
    const [stale] = await db().insert(t.evalRuns).values({
      workspaceId: ws, agentId: agent.id, agentVersion: 1, config: {}, total: 1, startedAt: new Date(Date.now() - 3 * 3_600_000),
    }).returning();
    const res = await startRun(agent.id);
    expect(res.statusCode).toBe(202);
    const [after] = await db().select().from(t.evalRuns).where(eq(t.evalRuns.id, stale!.id));
    expect(after).toMatchObject({ status: 'failed', error: 'interrupted' });
    // the new run is fresh (`running` or already done) and a second start while it runs is refused
    await untilDone(res.json().id);
    await db().insert(t.evalRuns).values({ workspaceId: ws, agentId: agent.id, agentVersion: 1, config: {}, total: 1 });
    expect((await startRun(agent.id)).json().error.code).toBe('eval_run_in_progress');
  });

  it('F2: run-all skips an agent whose provider setup throws and still starts the others', async () => {
    await db().delete(t.evalRuns);
    await db().delete(t.evalCases);
    const ok = await mkAgent();
    const [bad] = await db().insert(t.agents).values({ workspaceId: ws, name: `bad-${seq++}`, provider: 'anthropic', model: 'm', systemPrompt: 'p' }).returning();
    for (const a of [ok, bad!]) await mkCase(a.id, 'c1');
    const container = Object.create(app.container, {
      llm: { value: async (id: string) => { if (id === 'anthropic') throw new Error('boom'); return app.container.llm(id as 'openai'); } },
    });
    const log = { info: () => {}, error: () => {} };
    const out = await new EvalService(container).runAll(ws, log);
    expect(out.started.map((r) => r.agent_id)).toContain(ok.id);
    expect(out.started.map((r) => r.agent_id)).not.toContain(bad!.id);
    expect(out.skipped).toContainEqual(expect.objectContaining({ agent_id: bad!.id, reason: 'provider_error' }));
    await untilDone(out.started.find((r) => r.agent_id === ok.id)!.id);
  });

  it('seed: Security Reviewer gets 8 eval cases, re-seeding adds none', async () => {
    const count = async () => (await db().select().from(t.evalCases)).length;
    await db().delete(t.evalCases); // earlier tests clear the table
    await seed(db());
    expect(await count()).toBe(8);
    await seed(db());
    expect(await count()).toBe(8);
    const [sec] = await db().select().from(t.agents).where(eq(t.agents.name, 'Security Reviewer'));
    const rows = await db().select().from(t.evalCases).where(eq(t.evalCases.agentId, sec!.id));
    expect(rows.filter((r) => r.expectationType === 'must_find').length).toBeGreaterThanOrEqual(5);
    expect(rows.filter((r) => r.expectationType === 'must_not_flag').length).toBeGreaterThanOrEqual(3);
  });
});
