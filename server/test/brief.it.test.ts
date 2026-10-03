import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import { BriefService } from '../src/modules/brief/service.js';
import { AppError } from '../src/platform/errors.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { PrBrief } from '@devdigest/shared';
import type { AppConfig } from '../src/platform/config.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const PATCH = ['@@ -10,3 +10,5 @@ export const cfg', ' port: 3000,', '+SECRET_BODY_LINE = 1', '-old_removed_line', ' x'].join('\n');

/** openrouter LLM whose completeStructured is scripted; counts calls, never touches the network. */
class ScriptedLLM implements LLMProvider {
  readonly id = 'openrouter' as const;
  calls: StructuredRequest<unknown>[] = [];
  constructor(private fn: (req: StructuredRequest<unknown>) => Promise<unknown> | unknown) {}
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('complete() must not be used for the brief');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(req as StructuredRequest<unknown>);
    const data = (await this.fn(req as StructuredRequest<unknown>)) as T;
    return { data, model: req.model, tokensIn: 120, tokensOut: 60, costUsd: 0.0012345678, raw: '{}', attempts: 1 };
  }
  async embed(): Promise<number[][]> {
    return [];
  }
}

const good = (over: Record<string, unknown> = {}) => ({
  summary: 'Adds a port to the config.',
  risks: [
    { kind: 'weird-kind', title: 'Config drift', explanation: 'Port changed.', severity: 'medium', file_refs: ['src/config.ts:12'] },
    { kind: 'security', title: 'Ghost', explanation: 'x', severity: 'low', file_refs: ['/etc/passwd'] },
  ],
  review_focus: [
    { file: 'src/config.ts', line: 12, reason: 'port changed' },
    { file: 'src/config.ts', line: 99, reason: 'out of range' },
  ],
  ...over,
});

const blastOk = {
  getBlastRadius: async () => ({
    changedSymbols: [{ file: 'src/config.ts', name: 'cfg', kind: 'const' }],
    callers: [{ file: 'src/api/health.ts', symbol: 'health', viaSymbol: 'cfg', line: 11, rank: 1 }],
    impactedEndpoints: [],
    factsByFile: { 'src/api/health.ts': { endpoints: ['GET /health'], crons: [] } },
  }),
} as unknown as RepoIntel;
const blastDegraded = {
  getBlastRadius: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' }),
} as unknown as RepoIntel;
const blastThrows = {
  getBlastRadius: async () => {
    throw new Error('index exploded');
  },
} as unknown as RepoIntel;

d('PR brief module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let wsId: string;
  let n = 0;

  beforeAll(async () => {
    pg = await startPg();
    wsId = (await seed(pg.handle.db)).workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(opts: { config?: AppConfig; llm?: LLMProvider | null; repoIntel?: RepoIntel; github?: MockGitHubClient; secrets?: Record<string, string>; openai?: MockLLMProvider } = {}) {
    const openrouter = opts.llm === undefined ? new ScriptedLLM(() => good()) : opts.llm;
    return buildApp({
      config: opts.config ?? config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({}),
        github: opts.github ?? new MockGitHubClient(),
        secrets: new MockSecretsProvider(opts.secrets ?? {}),
        repoIntel: opts.repoIntel ?? blastOk,
        llm: {
          openai: opts.openai ?? new MockLLMProvider('openai'),
          anthropic: new MockLLMProvider('anthropic'),
          ...(openrouter ? { openrouter } : {}),
        },
      },
    });
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  /** A repo + PR (+ files with a patch) in `workspaceId`. */
  async function mkPr(over: { workspaceId?: string; files?: number; filesCount?: number; body?: string | null; status?: string } = {}) {
    const workspaceId = over.workspaceId ?? wsId;
    const name = `brief-${++n}`;
    const [repo] = await pg.handle.db.insert(t.repos).values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` }).returning();
    const nFiles = over.files ?? 1;
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: 100 + n, title: 'Add port', author: 'a', branch: 'f', base: 'main',
        headSha: 'abc123def', additions: 1, deletions: 0, filesCount: over.filesCount ?? nFiles,
        status: over.status ?? 'needs_review', body: over.body === undefined ? 'Plain description.' : over.body,
      })
      .returning();
    if (nFiles > 0) {
      await pg.handle.db.insert(t.prFiles).values(
        Array.from({ length: nFiles }, (_, i) => ({
          prId: pr!.id, path: i === 0 ? 'src/config.ts' : `src/extra${i}.ts`, additions: 1, deletions: 0, patch: PATCH,
        })),
      );
    }
    return { repo: repo!, pr: pr! };
  }

  const get = (app: App, id: string) => app.inject({ method: 'GET', url: `/pulls/${id}/brief` });
  const post = (app: App, id: string) => app.inject({ method: 'POST', url: `/pulls/${id}/brief` });
  const brief = (res: { json(): unknown }) => PrBrief.parse(res.json());
  const sentTexts = (llm: ScriptedLLM) => JSON.stringify(llm.calls.map((c) => c.messages));

  it('AC-12: GET with no stored row answers null and makes no model call', async () => {
    const llm = new ScriptedLLM(() => good());
    const app = await makeApp({ llm });
    const { pr } = await mkPr();
    const res = await get(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('AC-11, AC-14, AC-37, AC-54, AC-57, AC-58: POST stores a grounded brief; a second POST replaces it', async () => {
    const llm = new ScriptedLLM(() => good());
    const app = await makeApp({ llm });
    const { pr } = await mkPr();
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    const b = brief(res);
    expect(b.head_sha).toBe('abc123def');
    expect(b.risks.risks).toHaveLength(1);
    expect(b.risks.risks[0]).toMatchObject({ kind: 'other', file_refs: ['src/config.ts:12'] });
    expect(b.review_focus).toEqual([{ file: 'src/config.ts', line: 12, reason: 'port changed' }]);
    expect(b.dropped_items).toBe(2);
    expect(b).toMatchObject({ provider: 'openrouter', model: 'google/gemini-2.5-flash-lite', llm_calls: 1, tokens_in: 120, tokens_out: 60, cost_usd: 0.001235 });
    expect(b.duration_ms).toBeGreaterThanOrEqual(0);
    expect(b.blast?.changed_symbols).toEqual([{ name: 'cfg', file: 'src/config.ts', kind: 'const' }]);
    expect(b.blast?.downstream[0]?.callers[0]?.file).toBe('src/api/health.ts');
    expect(b.missing).toEqual(['intent']);
    expect(b.truncated).toBe(false);

    expect(brief(await get(app, pr.id))).toEqual(b);
    const [row] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(PrBrief.safeParse(row!.json).success).toBe(true);

    const second = await post(app, pr.id);
    expect(second.statusCode).toBe(200);
    expect(brief(await get(app, pr.id)).generated_at).toBe(brief(second).generated_at);
    expect(await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id))).toHaveLength(1);
    await app.close();
  });

  it('AC-28, AC-29, AC-32: the request carries title, intent and finding facts but no patch body; no intent means intent null', async () => {
    const llm = new ScriptedLLM(() => good());
    const app = await makeApp({ llm });
    const { pr } = await mkPr();
    await pg.handle.db.insert(t.prIntent).values({
      prId: pr.id, summary: 'INTENT_SUMMARY_TEXT', inScope: ['a'], outOfScope: ['b'], headSha: 'old-sha', model: 'm', confidence: 'high', sources: [], missingContext: [],
    });
    const [review] = await pg.handle.db.insert(t.reviews).values({ workspaceId: wsId, prId: pr.id, agentId: null, kind: 'review', verdict: 'comment', summary: 's', score: 80, model: 'm' }).returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: review!.id, file: 'src/config.ts', startLine: 12, endLine: 12, severity: 'WARNING', category: 'bug', title: 'FINDING_TITLE_X', rationale: 'r', confidence: 0.9,
    });
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    const text = sentTexts(llm);
    expect(text).toContain('Add port');
    expect(text).toContain('INTENT_SUMMARY_TEXT');
    expect(text).toContain('FINDING_TITLE_X');
    expect(text).not.toContain('SECRET_BODY_LINE');
    expect(text).not.toContain('old_removed_line');
    expect(brief(res).intent?.summary).toBe('INTENT_SUMMARY_TEXT');
    expect(brief(res).missing).not.toContain('intent');

    const bare = await mkPr();
    const r2 = await post(app, bare.pr.id);
    expect(brief(r2).intent).toBeNull();
    expect(brief(r2).missing).toContain('intent');
    expect(llm.calls.filter((c) => c.schemaName !== 'PrBrief')).toHaveLength(0); // no derivation
    await app.close();
  });

  it('AC-33, EC-9: degraded and throwing blast give blast null and missing blast', async () => {
    for (const repoIntel of [blastDegraded, blastThrows]) {
      const app = await makeApp({ repoIntel });
      const { pr } = await mkPr();
      const res = await post(app, pr.id);
      expect(res.statusCode).toBe(200);
      expect(brief(res).blast).toBeNull();
      expect(brief(res).missing).toContain('blast');
      await app.close();
    }
  });

  it('AC-34: a linked issue that cannot be fetched is missing issue; description absent is missing description', async () => {
    const github = new MockGitHubClient();
    github.getIssue = async () => {
      throw new Error('404');
    };
    const llm = new ScriptedLLM(() => good());
    const app = await makeApp({ github, llm });
    const a = await mkPr({ body: 'Closes #7' });
    expect(brief(await post(app, a.pr.id)).missing).toContain('issue');
    const b = await mkPr({ body: null });
    expect(brief(await post(app, b.pr.id)).missing).toContain('description');
    await app.close();

    const ok = new ScriptedLLM(() => good());
    const app2 = await makeApp({ llm: ok });
    const c = await mkPr({ body: 'Closes #8' });
    const res = await post(app2, c.pr.id);
    expect(brief(res).missing).not.toContain('issue');
    expect(sentTexts(ok)).toContain('Issue #8');
    await app2.close();
  });

  it('AC-43, EC-1: a POST while the model is held answers 409 brief_in_progress; same-tick POSTs give one 200 and one 409', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const llm = new ScriptedLLM(async () => {
      await gate;
      return good();
    });
    const app = await makeApp({ llm });
    const { pr } = await mkPr();
    const first = post(app, pr.id);
    await new Promise((r) => setTimeout(r, 100));
    const blocked = await post(app, pr.id);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('brief_in_progress');
    release();
    expect((await first).statusCode).toBe(200);
    expect(llm.calls).toHaveLength(1);
    await app.close();

    const llm2 = new ScriptedLLM(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return good();
    });
    const app2 = await makeApp({ llm: llm2 });
    const other = await mkPr();
    const results = await Promise.all([post(app2, other.pr.id), post(app2, other.pr.id)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(llm2.calls).toHaveLength(1);
    await app2.close();
  });

  it('AC-44: a PR with no files answers 409 empty_diff and makes no call', async () => {
    const llm = new ScriptedLLM(() => good());
    const app = await makeApp({ llm });
    const { pr } = await mkPr({ files: 0, filesCount: 0 });
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('empty_diff');
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('AC-48: no API key answers 400 no_api_key naming the provider, with no call', async () => {
    const app = await makeApp({ llm: null });
    const { pr } = await mkPr();
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('no_api_key');
    expect(res.json().error.message).toContain('openrouter');
    expect(res.json().error.details).toEqual({ provider: 'openrouter' });
    await app.close();
  });

  it('AC-49, EC-16: a foreign or unknown PR is 404 on both endpoints; a deleted repo takes its brief with it', async () => {
    const app = await makeApp();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const foreign = await mkPr({ workspaceId: other!.id });
    for (const id of [foreign.pr.id, '00000000-0000-4000-8000-000000000000']) {
      expect((await get(app, id)).statusCode).toBe(404);
      expect((await post(app, id)).statusCode).toBe(404);
    }
    const { repo, pr } = await mkPr();
    expect((await post(app, pr.id)).statusCode).toBe(200);
    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repo.id));
    expect((await get(app, pr.id)).statusCode).toBe(404);
    expect((await post(app, pr.id)).statusCode).toBe(404);
    expect(await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id))).toHaveLength(0);
    await app.close();
  });

  it('AC-50: corrupt stored JSON reads as no brief', async () => {
    const app = await makeApp();
    const { pr } = await mkPr();
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: { history: [] } });
    const res = await get(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
    await app.close();
  });

  it('AC-51: 120 files reported vs 4 held sets files_truncated', async () => {
    const app = await makeApp();
    const { pr } = await mkPr({ files: 4, filesCount: 120 });
    expect(brief(await post(app, pr.id)).files_truncated).toBe(true);
    const full = await mkPr({ files: 2 });
    expect(brief(await post(app, full.pr.id)).files_truncated).toBe(false);
    await app.close();
  });

  it('AC-46, AC-31, EC-14: a failing model keeps the previous brief and maps to the right 502', async () => {
    let mode: 'ok' | 'wrong-shape' | 'rate' | 'boom' = 'ok';
    const llm = new ScriptedLLM(() => {
      if (mode === 'wrong-shape') throw new Error('OpenRouter structured output failed schema validation for PrBrief');
      if (mode === 'rate') throw Object.assign(new Error('Too many'), { status: 429 });
      if (mode === 'boom') throw new Error('network down');
      return good();
    });
    const app = await makeApp({ llm });
    const { pr } = await mkPr();
    const first = brief(await post(app, pr.id));
    const cases: [typeof mode, string][] = [['wrong-shape', 'invalid_model_output'], ['rate', 'rate_limited'], ['boom', 'provider_error']];
    for (const [m, code] of cases) {
      mode = m;
      const res = await post(app, pr.id);
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe(code);
      expect(brief(await get(app, pr.id))).toEqual(first);
    }
    expect(llm.calls.every((c) => c.maxRetries === 0)).toBe(true);
    await app.close();
  });

  it('AC-45, NFR-1: a model that never answers is cut at the timeout with 502 model_timeout and nothing is stored', async () => {
    const llm = new ScriptedLLM(() => new Promise(() => {}));
    const app = await makeApp({ llm });
    const { pr } = await mkPr();
    const service = new BriefService(app.container, { timeoutMs: 50 });
    const t0 = Date.now();
    const err = await service.generate(wsId, pr.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'model_timeout', statusCode: 502 });
    expect(Date.now() - t0).toBeLessThan(5_000);
    expect(await service.get(wsId, pr.id)).toBeNull();
    await app.close();
  });

  it('EC-15: a closed PR generates like an open one', async () => {
    const app = await makeApp();
    const { pr } = await mkPr({ status: 'closed' });
    expect((await post(app, pr.id)).statusCode).toBe(200);
    await app.close();
  });

  it('NFR-2: GET of a ~64 KB stored brief stays under 300 ms at p95', async () => {
    const app = await makeApp();
    const { pr } = await mkPr();
    const base = brief(await post(app, pr.id));
    const big = { ...base, summary: 's'.repeat(600), blast: { ...base.blast!, summary: 'x'.repeat(55_000) } };
    await pg.handle.db.update(t.prBrief).set({ json: big }).where(eq(t.prBrief.prId, pr.id));
    expect(Buffer.byteLength(JSON.stringify(big))).toBeGreaterThan(50_000);
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const s = Date.now();
      expect((await get(app, pr.id)).statusCode).toBe(200);
      times.push(Date.now() - s);
    }
    times.sort((a, b) => a - b);
    expect(times[18]!).toBeLessThan(300);
    await app.close();
  });

  it('AC-27: exactly one call goes to the resolved provider and model, also after a workspace override', async () => {
    const llm = new ScriptedLLM(() => good());
    const openai = new MockLLMProvider('openai', { structured: good() });
    const app = await makeApp({ llm, openai });
    const { pr } = await mkPr();
    await post(app, pr.id);
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.model).toBe('google/gemini-2.5-flash-lite');
    expect(openai.calls).toHaveLength(0);

    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'openai', model: 'gpt-4.1-mini' } } },
    });
    expect(put.statusCode).toBe(200);
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(brief(res)).toMatchObject({ provider: 'openai', model: 'gpt-4.1-mini' });
    expect(openai.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(llm.calls).toHaveLength(1);
    // the DB is shared with later tests: put the default back
    await app.inject({ method: 'PUT', url: '/settings', payload: { feature_models: { risk_brief: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' } } } });
    await app.close();
  });

  const LINE_FIELDS = ['pr_id', 'repo', 'pr_number', 'provider', 'model', 'llm_calls', 'tokens_in', 'tokens_out', 'cost_usd', 'duration_ms', 'status', 'reason', 'dropped_items', 'truncated'];
  type Line = Record<string, unknown>;
  const capture = () => {
    const lines: { obj: Line; msg?: string }[] = [];
    return { lines, log: { info: (obj: object, msg?: string) => void lines.push({ obj: obj as Line, msg }) } };
  };

  it('AC-53, NFR-9: exactly one complete line per outcome (ok, 409, 400, 502), never any prompt or description text', async () => {
    const run = async (opts: Parameters<typeof makeApp>[0], pr: { id: string }, prep?: () => void) => {
      const app = await makeApp(opts);
      prep?.();
      const cap = capture();
      const err = await new BriefService(app.container).generate(wsId, pr.id, cap.log).catch((e: unknown) => e);
      await app.close();
      expect(cap.lines).toHaveLength(1);
      expect(cap.lines[0]!.msg).toBe('pr brief generation');
      expect(Object.keys(cap.lines[0]!.obj).sort()).toEqual([...LINE_FIELDS].sort());
      return { line: cap.lines[0]!.obj, err };
    };
    const okPr = await mkPr({ body: 'DESCRIPTION_SECRET_TEXT' });
    const ok = await run({}, okPr.pr);
    expect(ok.line).toMatchObject({ status: 'ok', reason: null, repo: okPr.repo.fullName, pr_number: okPr.pr.number, llm_calls: 1, tokens_in: 120, dropped_items: 2 });
    expect(JSON.stringify(ok.line)).not.toContain('DESCRIPTION_SECRET_TEXT');
    expect(JSON.stringify(ok.line)).not.toContain('SECRET_BODY_LINE');

    const empty = await run({}, (await mkPr({ files: 0, filesCount: 0 })).pr);
    expect(empty.line).toMatchObject({ status: 'rejected', reason: 'empty_diff', llm_calls: 0 });
    const nokey = await run({ llm: null }, (await mkPr()).pr);
    expect(nokey.line).toMatchObject({ status: 'rejected', reason: 'no_api_key', llm_calls: 0 });
    const boom = await run({ llm: new ScriptedLLM(() => { throw new Error('network down'); }) }, (await mkPr()).pr);
    expect(boom.line).toMatchObject({ status: 'failed', reason: 'provider_error', llm_calls: 1 });
  });

  it('AC-52, AC-53: the 11th POST in a minute is 429 with no model call, and its log line carries repo and pr_number', async () => {
    const llm = new ScriptedLLM(() => good());
    const app = await makeApp({ llm, config: { ...config(), nodeEnv: 'development', logLevel: 'silent' } });
    const { repo, pr } = await mkPr();
    const cap = capture();
    const orig = BriefService.prototype.logRateLimited;
    const spy = vi.spyOn(BriefService.prototype, 'logRateLimited').mockImplementation(function (this: BriefService, ws, id) {
      return orig.call(this, ws, id, cap.log);
    });
    for (let i = 0; i < 10; i++) expect((await post(app, pr.id)).statusCode).toBe(200);
    expect(llm.calls).toHaveLength(10);
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(429);
    expect(llm.calls).toHaveLength(10);
    await vi.waitFor(() => expect(cap.lines).toHaveLength(1));
    expect(Object.keys(cap.lines[0]!.obj).sort()).toEqual([...LINE_FIELDS].sort());
    expect(cap.lines[0]!.msg).toBe('pr brief generation');
    expect(cap.lines[0]!.obj).toMatchObject({
      pr_id: pr.id, repo: repo.fullName, pr_number: pr.number, provider: 'openrouter', model: 'google/gemini-2.5-flash-lite',
      llm_calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: null, status: 'rejected', reason: 'rate_limited', dropped_items: 0, truncated: false,
    });
    spy.mockRestore();
    await app.close();
  });

  it('B1: the seeded brief of PR #483 parses and #484 has none', async () => {
    const app = await makeApp();
    const byNumber = async (num: number) => {
      const [row] = await pg.handle.db.select({ id: t.pullRequests.id }).from(t.pullRequests).where(and(eq(t.pullRequests.workspaceId, wsId), eq(t.pullRequests.number, num)));
      return row!.id;
    };
    const seeded = await get(app, await byNumber(483));
    expect(brief(seeded)).toMatchObject({ model: 'seed', cost_usd: null, head_sha: 'b7c1d9e2f3a4' });
    expect(brief(seeded).review_focus.map((f) => f.file)).toEqual(['src/services/refund.ts', 'src/services/refund.test.ts']);
    expect((await get(app, await byNumber(484))).json()).toBeNull();
    await seed(pg.handle.db); // idempotent
    expect(await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, await byNumber(483)))).toHaveLength(1);
    await app.close();
  });
});
