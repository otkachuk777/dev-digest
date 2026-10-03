import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

class TmpGit extends MockGitClient {
  constructor(private root: string) {
    super({ diff: DIFF });
  }
  override clonePathFor(repo: { owner: string; name: string }): string {
    return join(this.root, repo.owner, repo.name);
  }
}

const REVIEW = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };
const INTENT = { summary: 'x', in_scope: ['a'], out_of_scope: [], missing_context: [] };

const patch = '@@ -1,1 +1,2 @@\n a\n+b';
const FILES = ['src/a.ts', 'src/b.ts'];
const DIFF = FILES.map((f) => `diff --git a/${f} b/${f}\n--- a/${f}\n+++ b/${f}\n${patch}`).join('\n');

/** Project Context injected into review runs (Step A5). */
d('context injection into review runs', () => {
  let pg: PgFixture;
  let root: string;
  let wsId: string;
  let n = 0;

  beforeAll(async () => {
    pg = await startPg();
    wsId = (await seed(pg.handle.db)).workspaceId;
    root = await mkdtemp(join(tmpdir(), 'ctx-run-'));
  });
  afterAll(async () => {
    await pg?.stop();
    if (root) await rm(root, { recursive: true, force: true });
  });

  /** Fresh app + mock providers (every provider mocked, incl. openrouter for the intent call). */
  async function makeApp(review: unknown = REVIEW, failReview = false) {
    const openai = new MockLLMProvider('openai', { structured: review });
    if (failReview) openai.completeStructured = async () => Promise.reject(new Error('provider boom'));
    const llm = {
      openai,
      anthropic: new MockLLMProvider('anthropic'),
      openrouter: new MockLLMProvider('openrouter', { structuredBySchema: { PrIntent: INTENT } }),
    };
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new TmpGit(root), github: new MockGitHubClient(), llm },
    });
    return { app, llm };
  }

  async function mkRepoPr() {
    const name = `r${++n}`;
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'o', name, fullName: `o/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: wsId,
        repoId: repo!.id,
        number: 1,
        title: 'T',
        author: 'a',
        branch: 'f',
        base: 'main',
        headSha: 'abc12345',
        additions: 2,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
      })
      .returning();
    for (const path of FILES) await db.insert(t.prFiles).values({ prId: pr!.id, path, additions: 1, deletions: 0, patch });
    const dir = join(root, 'o', name);
    await mkdir(dir, { recursive: true });
    return { repoId: repo!.id, prId: pr!.id, dir };
  }

  async function put(dir: string, rel: string, content: string) {
    await mkdir(join(dir, rel, '..'), { recursive: true });
    await writeFile(join(dir, rel), content);
  }

  type App = Awaited<ReturnType<typeof makeApp>>['app'];
  async function mkAgent(app: App, strategy = 'single-pass') {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `ctx-agent-${++n}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'sys', strategy },
    });
    return res.json().id as string;
  }
  async function mkSkill(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `ctx-skill-${++n}`, description: 'A skill used by the context tests.', type: 'convention', body: 'skill body' },
    });
    return res.json().id as string;
  }
  const attachAgent = (app: App, id: string, repoId: string, paths: string[]) =>
    app.inject({ method: 'PUT', url: `/agents/${id}/context`, payload: { repo_id: repoId, paths } });
  const attachSkill = (app: App, id: string, repoId: string, paths: string[]) =>
    app.inject({ method: 'PUT', url: `/skills/${id}/context`, payload: { repo_id: repoId, paths } });

  /** Run once, wait, return the run's trace. */
  async function review(app: App, prId: string, agentId: string) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    const runId = res.json().runs[0].run_id as string;
    const runs = await waitForPrRuns(pg.handle.db, prId); // every run row of the PR settled
    const run = runs.find((r) => r.id === runId)!;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    return { run, trace };
  }

  const reviewCalls = (llm: { openai: MockLLMProvider }) =>
    llm.openai.calls.filter((c) => c.method === 'completeStructured');
  const promptOf = (call: { req: unknown }) =>
    (call.req as { messages: { content: string }[] }).messages.map((m) => m.content).join('\n');

  it('AC-28/29/38: agent doc then skill doc in link order, dedupe keeps agent origin; trace lists them', async () => {
    const { app, llm } = await makeApp();
    const { repoId, prId, dir } = await mkRepoPr();
    await put(dir, 'docs/a.md', 'AGENT-DOC');
    await put(dir, 'docs/s1.md', 'SKILL-DOC-1');
    await put(dir, 'docs/s2.md', 'SKILL-DOC-2');
    const agentId = await mkAgent(app);
    const s1 = await mkSkill(app);
    const s2 = await mkSkill(app);
    for (const s of [s1, s2]) await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_id: s } });
    expect((await attachAgent(app, agentId, repoId, ['docs/a.md'])).statusCode).toBe(200);
    await attachSkill(app, s1, repoId, ['docs/a.md', 'docs/s1.md']);
    await attachSkill(app, s2, repoId, ['docs/s2.md']);

    const { run, trace } = await review(app, prId, agentId);
    expect(run.status).toBe('done');
    const prompt = promptOf(reviewCalls(llm)[0]!);
    expect(prompt).toContain('## Project context');
    const at = (s: string) => prompt.indexOf(s);
    expect(at('AGENT-DOC')).toBeGreaterThan(-1);
    expect(at('AGENT-DOC')).toBeLessThan(at('SKILL-DOC-1'));
    expect(at('SKILL-DOC-1')).toBeLessThan(at('SKILL-DOC-2'));
    expect(prompt.split('AGENT-DOC').length - 1).toBe(1);
    expect(trace.specs_read).toEqual(['docs/a.md', 'docs/s1.md', 'docs/s2.md']);
    expect(trace.context_docs.map((c: { path: string; origin: string; status: string }) => [c.path, c.origin, c.status])).toEqual([
      ['docs/a.md', 'agent', 'read'],
      ['docs/s1.md', 'skill', 'read'],
      ['docs/s2.md', 'skill', 'read'],
    ]);
    expect(trace.context_docs[1].origin_name).toMatch(/^ctx-skill-/);
    expect(trace.prompt_assembly.specs).toContain('AGENT-DOC');
    await app.close();
  });

  it('AC-37: a doc attached only for another repo is not injected', async () => {
    const { app, llm } = await makeApp();
    const a = await mkRepoPr();
    const b = await mkRepoPr();
    await put(b.dir, 'docs/other.md', 'OTHER-REPO-DOC');
    const agentId = await mkAgent(app);
    await attachAgent(app, agentId, b.repoId, ['docs/other.md']);
    const { run, trace } = await review(app, a.prId, agentId);
    expect(run.status).toBe('done');
    expect(promptOf(reviewCalls(llm)[0]!)).not.toContain('OTHER-REPO-DOC');
    expect(trace.specs_read).toEqual([]);
    await app.close();
  });

  it('AC-33: a missing doc is a trace `missing` entry + a warn log line; run still done', async () => {
    const { app } = await makeApp();
    const { repoId, prId, dir } = await mkRepoPr();
    await put(dir, 'docs/gone.md', 'soon gone');
    await put(dir, 'docs/ok.md', 'still here');
    const agentId = await mkAgent(app);
    await attachAgent(app, agentId, repoId, ['docs/gone.md', 'docs/ok.md']);
    await rm(join(dir, 'docs/gone.md'));
    const { run, trace } = await review(app, prId, agentId);
    expect(run.status).toBe('done');
    expect(trace.context_docs[0]).toMatchObject({ path: 'docs/gone.md', status: 'missing', tokens: 0 });
    expect(trace.specs_read).toEqual(['docs/ok.md']);
    const warn = trace.log.find((l: { kind: string }) => l.kind === 'warn');
    expect(warn.msg).toContain('docs/gone.md');
    await app.close();
  });

  it('AC-32 / NFR-1: a big doc is truncated, later docs keep heading + marker, injected tokens <= 8000', async () => {
    const { app, llm } = await makeApp();
    const { repoId, prId, dir } = await mkRepoPr();
    await put(dir, 'docs/big.md', 'lorem ipsum '.repeat(6000));
    await put(dir, 'docs/later.md', 'LATER-BODY');
    const agentId = await mkAgent(app);
    await attachAgent(app, agentId, repoId, ['docs/big.md', 'docs/later.md']);
    const { trace } = await review(app, prId, agentId);
    expect(trace.context_docs.map((c: { status: string }) => c.status)).toEqual(['truncated', 'truncated']);
    const sum = trace.context_docs.reduce((s: number, c: { tokens: number }) => s + c.tokens, 0);
    expect(sum).toBeLessThanOrEqual(8000);
    const specs = trace.prompt_assembly.specs as string;
    expect(specs).toContain('### docs/later.md\n[truncated]');
    expect(specs).not.toContain('LATER-BODY');
    expect(new TiktokenTokenizer().count(specs)).toBeLessThanOrEqual(8000 + 200);
    expect(promptOf(reviewCalls(llm)[0]!)).toContain('[truncated]');
    await app.close();
  });

  it('AC-34: every map-reduce call carries the Project context section', async () => {
    const { app, llm } = await makeApp();
    const { repoId, prId, dir } = await mkRepoPr();
    await put(dir, 'docs/a.md', 'MAP-DOC');
    const agentId = await mkAgent(app, 'map-reduce');
    await attachAgent(app, agentId, repoId, ['docs/a.md']);
    await review(app, prId, agentId);
    const calls = reviewCalls(llm);
    expect(calls.length).toBe(2);
    for (const c of calls) {
      expect(promptOf(c)).toContain('## Project context');
      expect(promptOf(c)).toContain('MAP-DOC');
    }
    await app.close();
  });

  it('AC-35 / NFR-2: no attachments -> no section, no context_docs, same LLM call count as with docs', async () => {
    const plain = await makeApp();
    const p = await mkRepoPr();
    const plainAgent = await mkAgent(plain.app);
    const { trace } = await review(plain.app, p.prId, plainAgent);
    expect(promptOf(reviewCalls(plain.llm)[0]!)).not.toContain('## Project context');
    expect(trace.context_docs).toBeUndefined();
    expect(trace.prompt_assembly.specs).toBeNull();

    const withDocs = await makeApp();
    const w = await mkRepoPr();
    await put(w.dir, 'docs/a.md', 'X');
    const docAgent = await mkAgent(withDocs.app);
    await attachAgent(withDocs.app, docAgent, w.repoId, ['docs/a.md']);
    await review(withDocs.app, w.prId, docAgent);
    expect(withDocs.llm.openai.calls.length).toBe(plain.llm.openai.calls.length);
    expect(withDocs.llm.openrouter.calls.length).toBe(plain.llm.openrouter.calls.length);
    await plain.app.close();
    await withDocs.app.close();
  });

  it('AC-41: a failed run (provider throws) still records specs_read/context_docs/prompt_assembly.specs', async () => {
    const { app } = await makeApp(REVIEW, true);
    const { repoId, prId, dir } = await mkRepoPr();
    await put(dir, 'docs/a.md', 'FAIL-DOC');
    const agentId = await mkAgent(app);
    await attachAgent(app, agentId, repoId, ['docs/a.md']);
    const { run, trace } = await review(app, prId, agentId);
    expect(run.status).toBe('failed');
    expect(trace.specs_read).toEqual(['docs/a.md']);
    expect(trace.context_docs[0]).toMatchObject({ path: 'docs/a.md', status: 'read' });
    expect(trace.prompt_assembly.specs).toContain('FAIL-DOC');
    await app.close();
  });

  it('AC-40 / EC-10: content changed on disk between runs -> second run injects the new text', async () => {
    const { app, llm } = await makeApp();
    const { repoId, prId, dir } = await mkRepoPr();
    await put(dir, 'docs/a.md', 'VERSION-ONE');
    const agentId = await mkAgent(app);
    await attachAgent(app, agentId, repoId, ['docs/a.md']);
    await review(app, prId, agentId);
    await put(dir, 'docs/a.md', 'VERSION-TWO-LONGER');
    await review(app, prId, agentId);
    const calls = reviewCalls(llm);
    expect(promptOf(calls[0]!)).toContain('VERSION-ONE');
    expect(promptOf(calls[1]!)).toContain('VERSION-TWO-LONGER');
    expect(promptOf(calls[1]!)).not.toContain('VERSION-ONE');
    await app.close();
  });
});
