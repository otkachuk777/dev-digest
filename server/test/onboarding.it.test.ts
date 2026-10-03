import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import { OnboardingService } from '../src/modules/onboarding/service.js';
import { defaultFeatureModel } from '../src/modules/settings/index.js';
import { TimeoutError } from '../src/platform/resilience.js';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { Onboarding } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

/** Clone dir per repo under a tmp root: `<root>/<owner>/<name>`; hotness history is configurable. */
class TmpGit extends MockGitClient {
  constructor(private root: string, opts: ConstructorParameters<typeof MockGitClient>[0] = {}) {
    super(opts);
  }
  override clonePathFor(repo: { owner: string; name: string }): string {
    return join(this.root, repo.owner, repo.name);
  }
}
class HangingHistoryGit extends TmpGit {
  override recentCommitPaths(): Promise<string[][]> {
    return new Promise(() => {});
  }
}

/** LLM whose completeStructured is scripted. */
class ScriptedLLM implements LLMProvider {
  readonly id = 'openrouter' as const;
  calls = 0;
  constructor(private fn: (req: StructuredRequest<unknown>) => Promise<unknown>) {}
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('complete() must not be used for the tour');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls++;
    const data = (await this.fn(req as StructuredRequest<unknown>)) as T;
    return { data, model: req.model, tokensIn: 100, tokensOut: 50, costUsd: 0.001, raw: '{}', attempts: 1 };
  }
  async embed(): Promise<number[][]> {
    return [];
  }
}

const goodOutput = (over: Record<string, unknown> = {}) => ({
  architecture: { body: 'MODEL OVERVIEW', diagram: 'flowchart TD\nA-->B' },
  critical_path_reasons: [],
  reading_path_reasons: [],
  how_to_run: [{ command: 'pnpm install', comment: 'deps', cwd: null }],
  first_tasks: [{ title: 'Add a test', scope_path: 'src/main.ts', complexity: 'Low' }],
  ...over,
});

function capLog() {
  const lines: { level: string; obj: Record<string, unknown>; msg?: string }[] = [];
  const mk = (level: string) => (obj: object, msg?: string) => {
    lines.push({ level, obj: obj as Record<string, unknown>, msg });
  };
  return { log: { info: mk('info'), warn: mk('warn'), error: mk('error') }, lines };
}
const genLines = (lines: ReturnType<typeof capLog>['lines']) => lines.filter((l) => l.msg === 'onboarding generation');

d('onboarding module', () => {
  let pg: PgFixture;
  let root: string;
  let wsId: string;
  let n = 0;
  const model = defaultFeatureModel('onboarding');

  beforeAll(async () => {
    pg = await startPg();
    wsId = (await seed(pg.handle.db)).workspaceId;
    root = await mkdtemp(join(tmpdir(), 'onb-it-'));
  });
  afterAll(async () => {
    await pg?.stop();
    if (root) await rm(root, { recursive: true, force: true });
  });

  function makeApp(opts: { llm?: LLMProvider | null; git?: MockGitClient; secrets?: Record<string, string> } = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm = opts.llm === null ? {} : { openrouter: opts.llm ?? new MockLLMProvider('openrouter', { structured: goodOutput() }), openai: new MockLLMProvider('openai'), anthropic: new MockLLMProvider('anthropic') };
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: opts.git ?? new TmpGit(root, { commitPaths: [] }),
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider(opts.secrets ?? {}),
        llm,
      },
    });
  }

  async function put(dir: string, rel: string, content: string) {
    await mkdir(dirname(join(dir, rel)), { recursive: true });
    await writeFile(join(dir, rel), content);
  }

  /** Insert a repo in the default workspace; with a small clone unless `clone:false`. */
  async function mkRepo(clone = true) {
    const name = `r${++n}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'o', name, fullName: `o/${name}` })
      .returning();
    const dir = join(root, 'o', name);
    if (clone) {
      await put(dir, 'package.json', JSON.stringify({ main: 'src/main.ts', scripts: { dev: 'tsx', build: 'tsc' } }));
      await put(dir, 'pnpm-lock.yaml', 'lockfileVersion: 9');
      await put(dir, 'README.md', '# Hello\nSECRET-README-CONTENT see [main](src/main.ts)\n');
      await put(dir, 'src/main.ts', 'export {};');
      await put(dir, 'src/util.ts', 'export {};');
    }
    return { id: repo!.id, dir, fullName: `o/${name}` };
  }

  const post = (app: Awaited<ReturnType<typeof makeApp>>, id: string) =>
    app.inject({ method: 'POST', url: `/repos/${id}/onboarding/generate` });
  const get = (app: Awaited<ReturnType<typeof makeApp>>, id: string) =>
    app.inject({ method: 'GET', url: `/repos/${id}/onboarding` });

  describe('GET /repos/:id/onboarding', () => {
    it('no stored tour -> state with the onboarding model and tour null (AC-13)', async () => {
      const { id } = await mkRepo();
      const app = await makeApp();
      const res = await get(app, id);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        clone_status: 'ok',
        generating: false,
        current_commit_sha: null,
        model: { provider: model.provider, model: model.model },
        tour: null,
      });
      await app.close();
    });

    it('no clone dir -> clone_status no_clone (AC-23)', async () => {
      const { id } = await mkRepo(false);
      const app = await makeApp();
      const res = await get(app, id);
      expect(res.json().clone_status).toBe('no_clone');
      await app.close();
    });

    it('current_commit_sha is the indexed commit (AC-21)', async () => {
      const { id } = await mkRepo();
      await pg.handle.db.insert(t.repoIndexState).values({ repoId: id, lastIndexedSha: 'idxsha', indexerVersion: 1, status: 'full', filesIndexed: 2 });
      const app = await makeApp();
      expect((await get(app, id)).json().current_commit_sha).toBe('idxsha');
      await app.close();
    });

    it('EC-3: a stored row of the old shape -> tour null', async () => {
      const { id } = await mkRepo();
      await pg.handle.db.insert(t.onboarding).values({ repoId: id, json: { sections: [{ kind: 'x', title: 'old' }] } });
      const app = await makeApp();
      const res = await get(app, id);
      expect(res.statusCode).toBe(200);
      expect(res.json().tour).toBeNull();
      await app.close();
    });

    it('EC-17: a repo of another workspace is 404 not_found', async () => {
      const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'onb-other' }).returning();
      const [foreign] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId: otherWs!.id, owner: 'x', name: 'y', fullName: 'x/y' })
        .returning();
      const app = await makeApp();
      const res = await get(app, foreign!.id);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
      const gen = await post(app, foreign!.id);
      expect(gen.statusCode).toBe(404);
      await app.close();
    });

    it('NFR-9: p95 <= 300 ms with a 256 KB stored tour', async () => {
      const { id, fullName } = await mkRepo();
      const bigPath = (i: number) => `src/${'d'.repeat(12000)}${i}.ts`;
      const tour = {
        repo_full_name: fullName, commit_sha: 'abc', generated_at: new Date().toISOString(),
        status: 'full', skeleton_reason: null, notes: [], files_total: 5, files_indexed: 5,
        provider: 'openrouter', model: 'm', llm_calls: 1, tokens_in: 1, tokens_out: 1, cost_usd: 0.1,
        duration_ms: 5, dropped_items: 0,
        architecture: { body: 'b'.repeat(4000), diagram: null },
        critical_paths: Array.from({ length: 6 }, (_, i) => ({ path: bigPath(i), reason: 'r' })),
        how_to_run: [],
        reading_path: Array.from({ length: 10 }, (_, i) => ({ path: bigPath(i), reason: 'r', rank: 0.1, hotness: 0 })),
        first_tasks: Array.from({ length: 5 }, (_, i) => ({ title: 't', scope_path: bigPath(i), complexity: 'Low' })),
      };
      expect(Onboarding.safeParse(tour).success).toBe(true);
      expect(JSON.stringify(tour).length).toBeGreaterThan(240 * 1024);
      await pg.handle.db.insert(t.onboarding).values({ repoId: id, json: tour });
      const app = await makeApp();
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now();
        const res = await get(app, id);
        times.push(performance.now() - t0);
        expect(res.statusCode).toBe(200);
        expect(res.json().tour).not.toBeNull();
      }
      times.sort((a, b) => a - b);
      expect(times[Math.ceil(times.length * 0.95) - 1]!).toBeLessThanOrEqual(300);
      await app.close();
    });
  });

  describe('POST generate — rejections (AC-19, AC-22, NFR-4)', () => {
    it('AC-22: no clone -> 409 no_clone and no LLM call', async () => {
      const { id } = await mkRepo(false);
      const llm = new MockLLMProvider('openrouter', { structured: goodOutput() });
      const app = await makeApp({ llm });
      const res = await post(app, id);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('no_clone');
      expect(llm.calls).toEqual([]);
      await app.close();
    });

    it('AC-19/AC-20/EC-1: a second request while one runs -> 409 generation_in_progress, no extra LLM call; GET shows generating', async () => {
      const { id } = await mkRepo();
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const llm = new ScriptedLLM(async () => {
        await gate;
        return goodOutput();
      });
      const app = await makeApp({ llm });
      const first = post(app, id);
      await vi.waitFor(() => expect(llm.calls).toBe(1));
      expect((await get(app, id)).json().generating).toBe(true);
      const second = await post(app, id);
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe('generation_in_progress');
      expect(llm.calls).toBe(1);
      release();
      expect((await first).statusCode).toBe(200);
      expect((await get(app, id)).json().generating).toBe(false);
      await app.close();
    });
  });

  describe('POST generate — success (AC-17, AC-25, AC-32, AC-35, AC-36, AC-38, AC-57)', () => {
    it('stores and returns a tour with metrics; exactly one LLM request, no repair retry', async () => {
      const { id, fullName } = await mkRepo();
      const llm = new MockLLMProvider('openrouter', { structured: goodOutput() });
      const app = await makeApp({ llm });
      const res = await post(app, id);
      expect(res.statusCode).toBe(200);
      const { tour, failed_attempt } = res.json();
      expect(failed_attempt).toBeNull();
      expect(Onboarding.safeParse(tour).success).toBe(true);
      expect(tour).toMatchObject({
        repo_full_name: fullName,
        commit_sha: 'a1b2c3d4',
        provider: model.provider,
        model: model.model,
        llm_calls: 1,
        tokens_in: 100,
        tokens_out: 50,
        cost_usd: 0.001,
        skeleton_reason: null,
      });
      expect(tour.duration_ms).toBeGreaterThanOrEqual(0);
      expect(tour.architecture.body).toBe('MODEL OVERVIEW');
      expect(tour.how_to_run).toEqual([{ command: 'pnpm install', comment: 'deps', cwd: null }]);
      expect(tour.first_tasks).toEqual([{ title: 'Add a test', scope_path: 'src/main.ts', complexity: 'Low' }]);
      // AC-35: one request; the service forbids the schema-repair loop.
      expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
      expect(llm.calls).toHaveLength(1);
      expect((llm.calls[0]!.req as { maxRetries?: number }).maxRetries).toBe(0);
      expect((llm.calls[0]!.req as { maxTokens?: number }).maxTokens).toBeLessThanOrEqual(4000);
      // AC-17: stored, and read back identically
      const stored = (await get(app, id)).json().tour;
      expect(stored).toEqual(tour);
      await app.close();
    });

    it('status is partial and notes name the missing index when there is none (AC-33, AC-47, EC-16)', async () => {
      const { id } = await mkRepo();
      const app = await makeApp();
      const { tour } = (await post(app, id)).json();
      expect(tour.status).toBe('partial');
      expect(tour.notes).toEqual(['index_degraded', 'graph_unavailable']);
      await app.close();
    });

    it('AC-32/AC-34: files_total counts clone files, files_indexed the index state, files_bounded when bounded', async () => {
      const { id } = await mkRepo();
      await pg.handle.db.insert(t.repoIndexState).values({ repoId: id, lastIndexedSha: 'x', indexerVersion: 1, status: 'full', filesIndexed: 3, stats: { bounded: 4 } });
      const app = await makeApp();
      const { tour } = (await post(app, id)).json();
      expect(tour.files_total).toBe(5);
      expect(tour.files_indexed).toBe(3);
      expect(tour.notes).toContain('files_bounded');
      expect(tour.notes).not.toContain('index_degraded');
      await app.close();
    });

    it('AC-29: unreadable history -> hotness_unavailable; readable history -> no such note', async () => {
      const a = await mkRepo();
      const bad = await makeApp({ git: new TmpGit(root, { commitPaths: new Error('offline') }) });
      expect((await post(bad, a.id)).json().tour.notes).toContain('hotness_unavailable');
      await bad.close();
      const b = await mkRepo();
      const ok = await makeApp({ git: new TmpGit(root, { commitPaths: [] }) });
      expect((await post(ok, b.id)).json().tour.notes).not.toContain('hotness_unavailable');
      await ok.close();
    });

    it('AC-38/AC-39: ungrounded commands and tasks are dropped and counted', async () => {
      const { id } = await mkRepo();
      const llm = new MockLLMProvider('openrouter', {
        structured: goodOutput({
          how_to_run: [
            { command: 'pnpm run dev', comment: null, cwd: null },
            { command: 'rm -rf /', comment: null, cwd: null },
          ],
          first_tasks: [
            { title: 'ok', scope_path: 'src/util.ts', complexity: 'Medium' },
            { title: 'bad', scope_path: '../../etc/passwd', complexity: 'High' },
            { title: 'ghost', scope_path: 'nowhere/x.ts', complexity: 'High' },
          ],
        }),
      });
      const app = await makeApp({ llm });
      const { tour } = (await post(app, id)).json();
      expect(tour.how_to_run.map((c: { command: string }) => c.command)).toEqual(['pnpm run dev']);
      expect(tour.first_tasks.map((x: { title: string }) => x.title)).toEqual(['ok']);
      expect(tour.dropped_items).toBe(3);
      await app.close();
    });

    it('a second generation replaces the stored tour (AC-17)', async () => {
      const { id } = await mkRepo();
      const one = await makeApp({ llm: new MockLLMProvider('openrouter', { structured: goodOutput({ architecture: { body: 'FIRST', diagram: null } }) }) });
      await post(one, id);
      await one.close();
      const two = await makeApp({ llm: new MockLLMProvider('openrouter', { structured: goodOutput({ architecture: { body: 'SECOND', diagram: null } }) }) });
      await post(two, id);
      expect((await get(two, id)).json().tour.architecture.body).toBe('SECOND');
      const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, id));
      expect(rows).toHaveLength(1);
      await two.close();
    });
  });

  describe('POST generate — failures become skeletons (AC-41, AC-43, AC-44, EC-10, EC-11)', () => {
    const cases: [string, () => unknown, string, number][] = [
      ['provider_error', () => new Error('boom'), 'provider_error', 1],
      ['rate_limited (EC-11)', () => Object.assign(new Error('429'), { status: 429 }), 'rate_limited', 1],
      ['timeout', () => new TimeoutError(120_000), 'timeout', 1],
      ['invalid_output', () => Object.assign(new Error('x'), { name: 'ZodError' }), 'invalid_output', 1],
    ];
    it.each(cases)('%s', async (_n, mkErr, reason, calls) => {
      const { id } = await mkRepo();
      const llm = new ScriptedLLM(async () => {
        throw mkErr();
      });
      const app = await makeApp({ llm });
      const res = await post(app, id);
      expect(res.statusCode).toBe(200);
      const { tour, failed_attempt } = res.json();
      expect(failed_attempt).toBeNull();
      expect(tour).toMatchObject({ status: 'skeleton', skeleton_reason: reason, llm_calls: calls, tokens_in: 0, tokens_out: 0, cost_usd: null, first_tasks: [] });
      expect(tour.architecture.diagram).toBeNull();
      expect(llm.calls).toBe(1); // never retried
      // AC-43: stored
      expect((await get(app, id)).json().tour).toEqual(tour);
      await app.close();
    });

    it('EC-10: no API key -> skeleton no_api_key with llm_calls 0 and no network request (NFR-10)', async () => {
      const { id } = await mkRepo();
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const app = await makeApp({ llm: null, secrets: {} });
      const res = await post(app, id);
      const { tour } = res.json();
      expect(res.statusCode).toBe(200);
      expect(tour).toMatchObject({ status: 'skeleton', skeleton_reason: 'no_api_key', llm_calls: 0, tokens_in: 0, cost_usd: null });
      const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(urls.filter((u) => /openrouter|openai|anthropic/.test(u))).toEqual([]);
      fetchSpy.mockRestore();
      await app.close();
    });

    it('AC-25/AC-42: the skeleton is built from the clone facts (install command from the lockfile)', async () => {
      const { id } = await mkRepo();
      const app = await makeApp({ llm: null });
      const { tour } = (await post(app, id)).json();
      expect(tour.how_to_run[0]).toEqual({ command: 'pnpm install', comment: null, cwd: null });
      expect(tour.how_to_run.map((c: { command: string }) => c.command)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^pnpm (run )?dev$/), expect.stringMatching(/^pnpm (run )?build$/)]),
      );
      expect(tour.architecture.body).toContain('Stack');
      await app.close();
    });

    it('AC-44: a failure keeps the stored full/partial tour and returns failed_attempt with the skeleton', async () => {
      const { id } = await mkRepo();
      const ok = await makeApp();
      const prev = (await post(ok, id)).json().tour;
      await ok.close();
      const failing = await makeApp({ llm: new ScriptedLLM(async () => { throw new Error('boom'); }) });
      const res = await post(failing, id);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.tour).toEqual(prev);
      expect(body.failed_attempt.reason).toBe('provider_error');
      expect(body.failed_attempt.skeleton).toMatchObject({ status: 'skeleton', skeleton_reason: 'provider_error' });
      expect(Onboarding.safeParse(body.failed_attempt.skeleton).success).toBe(true);
      expect((await get(failing, id)).json().tour).toEqual(prev);
      await failing.close();
    });

    it('AC-43: a stored skeleton is replaced by a new skeleton (no failed_attempt)', async () => {
      const { id } = await mkRepo();
      const app = await makeApp({ llm: null });
      const first = (await post(app, id)).json();
      const second = (await post(app, id)).json();
      expect(first.tour.status).toBe('skeleton');
      expect(second.failed_attempt).toBeNull();
      expect(second.tour.status).toBe('skeleton');
      expect(new Date(second.tour.generated_at).getTime()).toBeGreaterThanOrEqual(new Date(first.tour.generated_at).getTime());
      await app.close();
    });
  });

  describe('repository removal (AC-24, EC-2)', () => {
    it('AC-24: deleting the repo deletes its tour', async () => {
      const { id } = await mkRepo();
      const app = await makeApp();
      await post(app, id);
      expect(await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, id))).toHaveLength(1);
      await pg.handle.db.delete(t.repos).where(eq(t.repos.id, id));
      expect(await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, id))).toHaveLength(0);
      await app.close();
    });

    it('EC-2: a repo removed while its generation runs -> 404 and nothing stored', async () => {
      const { id } = await mkRepo();
      const llm = new ScriptedLLM(async () => {
        await pg.handle.db.delete(t.repos).where(eq(t.repos.id, id));
        return goodOutput();
      });
      const app = await makeApp({ llm });
      const res = await post(app, id);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
      expect(await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, id))).toHaveLength(0);
      await app.close();
    });
  });

  describe('time limits (AC-49, NFR-1, NFR-2)', () => {
    it('AC-49/NFR-1 (a): a model that never answers -> skeleton timeout within timeoutMs + persistence margin', async () => {
      const { id } = await mkRepo();
      const llm = new ScriptedLLM(() => new Promise(() => {}));
      const app = await makeApp({ llm });
      const svc = new OnboardingService(app.container, undefined, { timeoutMs: 200, historyTimeoutMs: 200 });
      const t0 = Date.now();
      const { tour } = await svc.generate(wsId, id);
      expect(Date.now() - t0).toBeLessThan(200 + 1500);
      expect(tour).toMatchObject({ status: 'skeleton', skeleton_reason: 'timeout', llm_calls: 1 });
      await app.close();
    });

    it('AC-49/NFR-1 (b): history slower than the whole budget -> skeleton timeout with no LLM request, still within the limit', async () => {
      const { id } = await mkRepo();
      const llm = new ScriptedLLM(async () => goodOutput());
      const app = await makeApp({ llm, git: new HangingHistoryGit(root) });
      const svc = new OnboardingService(app.container, undefined, { timeoutMs: 200, historyTimeoutMs: 200 });
      const t0 = Date.now();
      const { tour } = await svc.generate(wsId, id);
      expect(Date.now() - t0).toBeLessThan(200 + 1500);
      expect(tour).toMatchObject({ status: 'skeleton', skeleton_reason: 'timeout', llm_calls: 0 });
      expect(llm.calls).toBe(0);
      await app.close();
    });

    it('NFR-2: fixture-scale fact collection finishes far below 20 s', async () => {
      const { id } = await mkRepo();
      const app = await makeApp({ llm: null });
      const t0 = Date.now();
      const { tour } = (await post(app, id)).json();
      expect(Date.now() - t0).toBeLessThan(20_000);
      expect(tour.duration_ms).toBeLessThan(20_000);
      await app.close();
    });
  });

  describe('log line (AC-56, NFR-5)', () => {
    async function run(opts: Parameters<typeof makeApp>[0], repo: Awaited<ReturnType<typeof mkRepo>> | { id: string }) {
      const app = await makeApp(opts);
      const cap = capLog();
      const svc = new OnboardingService(app.container, cap.log);
      const out = await svc.generate(wsId, repo.id).then((r) => ({ r }), (e) => ({ e }));
      return { app, cap, out };
    }
    const FIELDS = ['repo', 'repo_id', 'provider', 'model', 'llm_calls', 'tokens_in', 'tokens_out', 'cost_usd', 'duration_ms', 'status', 'reason', 'dropped_items'];

    it('success: exactly one info line with every field; no file content, prompt or secret', async () => {
      const repo = await mkRepo();
      const { app, cap } = await run({ secrets: { OPENROUTER_API_KEY: 'sk-or-SECRETKEY' } }, repo);
      const lines = genLines(cap.lines);
      expect(lines).toHaveLength(1);
      expect(lines[0]!.level).toBe('info');
      expect(cap.lines.filter((l) => l.level !== 'info' && l.msg === 'onboarding generation')).toEqual([]);
      for (const f of FIELDS) expect(lines[0]!.obj).toHaveProperty(f);
      expect(lines[0]!.obj).toMatchObject({
        repo: repo.fullName, repo_id: repo.id, provider: model.provider, model: model.model,
        llm_calls: 1, tokens_in: 100, tokens_out: 50, cost_usd: 0.001, status: 'partial', reason: null, dropped_items: 0,
      });
      const dump = JSON.stringify(cap.lines);
      expect(dump).not.toContain('SECRET-README-CONTENT');
      expect(dump).not.toContain('SECRETKEY');
      expect(dump).not.toContain('MODEL OVERVIEW');
      expect(dump).not.toMatch(/untrusted/);
      await app.close();
    });

    it('skeleton: status skeleton and reason = skeleton_reason', async () => {
      const repo = await mkRepo();
      const { app, cap } = await run({ llm: null }, repo);
      const lines = genLines(cap.lines);
      expect(lines).toHaveLength(1);
      expect(lines[0]!.obj).toMatchObject({ status: 'skeleton', reason: 'no_api_key', llm_calls: 0, tokens_in: 0, tokens_out: 0 });
      await app.close();
    });

    it('rejections: no_clone, not_found and generation_in_progress each log one rejected line with llm_calls 0', async () => {
      const noClone = await mkRepo(false);
      const a = await run({}, noClone);
      expect(a.out).toHaveProperty('e');
      expect(genLines(a.cap.lines)).toHaveLength(1);
      expect(genLines(a.cap.lines)[0]!.obj).toMatchObject({ status: 'rejected', reason: 'no_clone', llm_calls: 0 });
      await a.app.close();

      const b = await run({}, { id: '00000000-0000-4000-8000-000000000000' });
      expect(b.out).toHaveProperty('e');
      expect(genLines(b.cap.lines)).toHaveLength(1);
      expect(genLines(b.cap.lines)[0]!.obj).toMatchObject({ status: 'rejected', reason: 'not_found', llm_calls: 0 });
      await b.app.close();

      const busy = await mkRepo();
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const llm = new ScriptedLLM(async () => { await gate; return goodOutput(); });
      const app = await makeApp({ llm });
      const cap = capLog();
      const svc = new OnboardingService(app.container, cap.log);
      const first = svc.generate(wsId, busy.id);
      await vi.waitFor(() => expect(llm.calls).toBe(1));
      await expect(svc.generate(wsId, busy.id)).rejects.toMatchObject({ code: 'generation_in_progress' });
      release();
      await first;
      const lines = genLines(cap.lines);
      expect(lines).toHaveLength(2);
      expect(lines.find((l) => l.obj.status === 'rejected')!.obj).toMatchObject({ reason: 'generation_in_progress', llm_calls: 0 });
      expect(llm.calls).toBe(1);
      await app.close();
    });
  });
});
