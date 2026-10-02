import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context] Docker not available — skipping integration tests.');
}

/** Clone dir per repo lives under a tmp root: `<root>/<owner>/<name>`. */
class TmpGit extends MockGitClient {
  constructor(private root: string) {
    super();
  }
  override clonePathFor(repo: { owner: string; name: string }): string {
    return join(this.root, repo.owner, repo.name);
  }
}

/**
 * Project Context module — listing + file endpoints (A3) and agent/skill
 * attachment endpoints (A4).
 */
d('context module', () => {
  let pg: PgFixture;
  let root: string;
  let wsId: string;
  let n = 0;
  const llm = {
    openai: new MockLLMProvider('openai'),
    anthropic: new MockLLMProvider('anthropic'),
    openrouter: new MockLLMProvider('openrouter'),
  };

  beforeAll(async () => {
    pg = await startPg();
    const s = await seed(pg.handle.db);
    wsId = s.workspaceId;
    root = await mkdtemp(join(tmpdir(), 'ctx-it-'));
  });
  afterAll(async () => {
    await pg?.stop();
    if (root) await rm(root, { recursive: true, force: true });
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new TmpGit(root), github: new MockGitHubClient(), llm },
    });
  }

  /** Insert a repo in the default workspace; `clone: false` leaves the clone dir absent. */
  async function mkRepo(clone = true) {
    const name = `r${++n}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'o', name, fullName: `o/${name}` })
      .returning();
    const dir = join(root, 'o', name);
    if (clone) await mkdir(dir, { recursive: true });
    return { id: repo!.id, dir };
  }

  async function put(dir: string, rel: string, content: string) {
    await mkdir(join(dir, rel, '..'), { recursive: true });
    await writeFile(join(dir, rel), content);
  }

  describe('GET /repos/:id/context', () => {
    it('lists docs with type, size and tokens (AC-1, AC-3, AC-25)', async () => {
      const { id, dir } = await mkRepo();
      const content = '# Spec\n\nSome text for the tokenizer to count.\n';
      await put(dir, '.devdigest/specs/a.md', content);
      await put(dir, 'docs/guide.md', 'guide');
      await put(dir, 'src/readme.md', 'not under a root');
      await put(dir, 'node_modules/x/docs/skip.md', 'skip');
      const app = await makeApp();
      const res = await app.inject({ method: 'GET', url: `/repos/${id}/context` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
      expect(body.glob).toBe('**/{specs,docs,insights}/**/*.md');
      expect(body.docs.map((x: { path: string }) => x.path)).toEqual([
        '.devdigest/specs/a.md',
        'docs/guide.md',
      ]);
      const a = body.docs[0];
      expect(a).toMatchObject({ type: 'specs', size: content.length, used_by_agents: 0, used_by_skills: 0 });
      expect(a.tokens).toBe(new TiktokenTokenizer().count(content));
      expect(body.total_tokens).toBe(body.docs.reduce((s: number, x: { tokens: number }) => s + x.tokens, 0));
      expect(body.synced_at).toBeNull();
      await app.close();
    });

    it('no clone dir → no_clone with no docs (AC-11)', async () => {
      const { id } = await mkRepo(false);
      const app = await makeApp();
      const res = await app.inject({ method: 'GET', url: `/repos/${id}/context` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'no_clone', docs: [], total_tokens: 0 });
      await app.close();
    });

    it('a changed file shows new tokens on the next listing (EC-10)', async () => {
      const { id, dir } = await mkRepo();
      await put(dir, 'docs/a.md', 'short');
      const app = await makeApp();
      const first = (await app.inject({ method: 'GET', url: `/repos/${id}/context` })).json();
      const longer = 'a considerably longer document body '.repeat(50);
      await put(dir, 'docs/a.md', longer);
      const future = new Date(Date.now() + 5000);
      await utimes(join(dir, 'docs/a.md'), future, future);
      const second = (await app.inject({ method: 'GET', url: `/repos/${id}/context` })).json();
      expect(second.docs[0].tokens).toBe(new TiktokenTokenizer().count(longer));
      expect(second.docs[0].tokens).toBeGreaterThan(first.docs[0].tokens);
      await app.close();
    });

    it('a repo of another workspace is 404', async () => {
      const db = pg.handle.db;
      const [otherWs] = await db.insert(t.workspaces).values({ name: 'ctx-other' }).returning();
      const [foreign] = await db
        .insert(t.repos)
        .values({ workspaceId: otherWs!.id, owner: 'x', name: 'y', fullName: 'x/y' })
        .returning();
      const app = await makeApp();
      expect((await app.inject({ method: 'GET', url: `/repos/${foreign!.id}/context` })).statusCode).toBe(404);
      expect(
        (await app.inject({ method: 'GET', url: `/repos/${foreign!.id}/context/file?path=docs/a.md` })).statusCode,
      ).toBe(404);
      await app.close();
    });
  });

  describe('agent / skill attachments', () => {
    const db = () => pg.handle.db;

    async function mkAgent(app: Awaited<ReturnType<typeof makeApp>>, name = 'A') {
      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
      });
      return res.json().id as string;
    }
    async function mkSkill(app: Awaited<ReturnType<typeof makeApp>>, name = 'S') {
      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name, description: 'd', type: 'convention', body: 'b' },
      });
      return res.json().id as string;
    }
    const putCtx = (
      app: Awaited<ReturnType<typeof makeApp>>,
      kind: 'agents' | 'skills',
      id: string,
      repo_id: string,
      paths: string[],
    ) => app.inject({ method: 'PUT', url: `/${kind}/${id}/context`, payload: { repo_id, paths } });
    const getCtx = (
      app: Awaited<ReturnType<typeof makeApp>>,
      kind: 'agents' | 'skills',
      id: string,
      repo_id: string,
    ) => app.inject({ method: 'GET', url: `/${kind}/${id}/context?repo_id=${repo_id}` });
    async function foreignWs() {
      const [ws] = await db().insert(t.workspaces).values({ name: `ctx-foreign-${++n}` }).returning();
      const [repo] = await db()
        .insert(t.repos)
        .values({ workspaceId: ws!.id, owner: 'f', name: `f${n}`, fullName: `f/f${n}` })
        .returning();
      const [agent] = await db()
        .insert(t.agents)
        .values({ workspaceId: ws!.id, name: 'FA', provider: 'openai', model: 'm', systemPrompt: 'x' })
        .returning();
      const [skill] = await db()
        .insert(t.skills)
        .values({ workspaceId: ws!.id, name: 'FS', description: 'd', type: 'custom', source: 'manual', body: 'b' })
        .returning();
      return { ws: ws!, repo: repo!, agent: agent!, skill: skill! };
    }

    it('attach then GET returns the stored order; another repo is untouched (AC-16, AC-31)', async () => {
      const r1 = await mkRepo();
      const r2 = await mkRepo();
      await put(r1.dir, 'docs/a.md', 'a');
      await put(r1.dir, 'specs/b.md', 'b');
      await put(r2.dir, 'docs/c.md', 'c');
      const app = await makeApp();
      const agentId = await mkAgent(app);
      const skillId = await mkSkill(app);
      for (const [kind, id] of [['agents', agentId], ['skills', skillId]] as const) {
        const put1 = await putCtx(app, kind, id, r1.id, ['specs/b.md', 'docs/a.md']);
        expect(put1.statusCode).toBe(200);
        const body = (await getCtx(app, kind, id, r1.id)).json();
        expect(body.attached.map((x: { path: string }) => x.path)).toEqual(['specs/b.md', 'docs/a.md']);
        expect(body.attached[0]).toMatchObject({ type: 'specs', status: 'present' });
        expect(body.budget_tokens).toBe(8000);
        await putCtx(app, kind, id, r2.id, ['docs/c.md']);
        const again = (await getCtx(app, kind, id, r1.id)).json();
        expect(again.attached.map((x: { path: string }) => x.path)).toEqual(['specs/b.md', 'docs/a.md']);
        const other = (await getCtx(app, kind, id, r2.id)).json();
        expect(other.attached.map((x: { path: string }) => x.path)).toEqual(['docs/c.md']);
      }
      expect((await getCtx(app, 'skills', skillId, r1.id)).json()).not.toHaveProperty('inherited');
      const listing = (await app.inject({ method: 'GET', url: `/repos/${r1.id}/context` })).json();
      expect(listing.docs.find((x: { path: string }) => x.path === 'docs/a.md')).toMatchObject({
        used_by_agents: 1,
        used_by_skills: 1,
      });
      await app.close();
    });

    it('deleting the agent drops the used-by count (EC-8)', async () => {
      const r = await mkRepo();
      await put(r.dir, 'docs/a.md', 'a');
      const app = await makeApp();
      const agentId = await mkAgent(app);
      await putCtx(app, 'agents', agentId, r.id, ['docs/a.md']);
      const count = async () =>
        (await app.inject({ method: 'GET', url: `/repos/${r.id}/context` })).json().docs[0].used_by_agents;
      expect(await count()).toBe(1);
      await app.inject({ method: 'DELETE', url: `/agents/${agentId}` });
      expect(await count()).toBe(0);
      await app.close();
    });

    it('agent, skill or repo of another workspace is 404 and nothing is stored (AC-17)', async () => {
      const own = await mkRepo();
      await put(own.dir, 'docs/a.md', 'a');
      const f = await foreignWs();
      const app = await makeApp();
      const agentId = await mkAgent(app);
      const skillId = await mkSkill(app);
      for (const [kind, id, repo] of [
        ['agents', f.agent.id, own.id],
        ['skills', f.skill.id, own.id],
        ['agents', agentId, f.repo.id],
        ['skills', skillId, f.repo.id],
      ] as const) {
        expect((await putCtx(app, kind, id, repo, ['docs/a.md'])).statusCode).toBe(404);
        expect((await getCtx(app, kind, id, repo)).statusCode).toBe(404);
      }
      expect(await db().select().from(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, f.agent.id))).toEqual([]);
      expect(await db().select().from(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, f.skill.id))).toEqual([]);
      expect(await db().select().from(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId))).toEqual([]);
      await app.close();
    });

    it('a new unlisted path is 400 unknown_path and stores nothing (AC-18)', async () => {
      const r = await mkRepo();
      await put(r.dir, 'docs/a.md', 'a');
      const app = await makeApp();
      const agentId = await mkAgent(app);
      const res = await putCtx(app, 'agents', agentId, r.id, ['docs/a.md', 'docs/nope.md']);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('unknown_path');
      expect((await getCtx(app, 'agents', agentId, r.id)).json().attached).toEqual([]);
      await app.close();
    });

    it('a stored path that vanished is accepted again and shown not_found (AC-26, EC-11)', async () => {
      const r = await mkRepo();
      await put(r.dir, 'docs/a.md', 'a');
      await put(r.dir, 'docs/b.md', 'b');
      const app = await makeApp();
      const agentId = await mkAgent(app);
      await putCtx(app, 'agents', agentId, r.id, ['docs/a.md', 'docs/b.md']);
      await rm(join(r.dir, 'docs/a.md'));
      const res = await putCtx(app, 'agents', agentId, r.id, ['docs/b.md', 'docs/a.md']);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.attached).toMatchObject([
        { path: 'docs/b.md', status: 'present' },
        { path: 'docs/a.md', status: 'not_found', type: null, tokens: 0 },
      ]);
      expect(body.total_tokens).toBe(body.attached[0].tokens);
      await app.close();
    });

    it('duplicate paths are 422 validation_error', async () => {
      const r = await mkRepo();
      const app = await makeApp();
      const agentId = await mkAgent(app);
      const res = await putCtx(app, 'agents', agentId, r.id, ['docs/a.md', 'docs/a.md']);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('validation_error');
      await app.close();
    });

    it('inherits only from enabled links of in-workspace skills (AC-19, EC-5)', async () => {
      const r = await mkRepo();
      await put(r.dir, 'docs/own.md', 'own');
      await put(r.dir, 'docs/off.md', 'off');
      await put(r.dir, 'docs/foreign.md', 'foreign');
      await put(r.dir, 'docs/skill.md', 'skill');
      const f = await foreignWs();
      const app = await makeApp();
      const agentId = await mkAgent(app);
      const onId = await mkSkill(app, 'On');
      const offId = await mkSkill(app, 'Off');
      await putCtx(app, 'skills', onId, r.id, ['docs/skill.md']);
      await putCtx(app, 'skills', offId, r.id, ['docs/off.md']);
      // raw rows: a foreign skill linked and holding paths for this repo, and a disabled link
      await db().insert(t.skillContextDocs).values({ skillId: f.skill.id, repoId: r.id, paths: ['docs/foreign.md'] });
      await db().insert(t.agentSkills).values([
        { agentId, skillId: onId, order: 0, enabled: true },
        { agentId, skillId: offId, order: 1, enabled: false },
        { agentId, skillId: f.skill.id, order: 2, enabled: true },
      ]);
      await putCtx(app, 'agents', agentId, r.id, ['docs/own.md']);
      const body = (await getCtx(app, 'agents', agentId, r.id)).json();
      expect(body.attached.map((x: { path: string }) => x.path)).toEqual(['docs/own.md']);
      expect(body.inherited).toMatchObject([{ path: 'docs/skill.md', skill_id: onId, skill_name: 'On' }]);
      await app.close();
    });

    it('a path on both agent and skill is counted once, agent origin wins (EC-4, AC-23)', async () => {
      const r = await mkRepo();
      await put(r.dir, 'docs/a.md', 'a doc with some words');
      const app = await makeApp();
      const agentId = await mkAgent(app);
      const skillId = await mkSkill(app);
      await db().insert(t.agentSkills).values({ agentId, skillId, order: 0, enabled: true });
      await putCtx(app, 'skills', skillId, r.id, ['docs/a.md']);
      await putCtx(app, 'agents', agentId, r.id, ['docs/a.md']);
      const body = (await getCtx(app, 'agents', agentId, r.id)).json();
      expect(body.attached).toHaveLength(1);
      expect(body.inherited).toEqual([]);
      expect(body.total_tokens).toBe(new TiktokenTokenizer().count('a doc with some words'));
      await app.close();
    });

    it('over-budget docs are listed in truncated_paths (AC-24)', async () => {
      const r = await mkRepo();
      await put(r.dir, 'docs/big.md', 'lorem ipsum dolor sit amet '.repeat(3000));
      await put(r.dir, 'docs/small.md', 'small');
      const app = await makeApp();
      const agentId = await mkAgent(app);
      await putCtx(app, 'agents', agentId, r.id, ['docs/big.md', 'docs/small.md']);
      const body = (await getCtx(app, 'agents', agentId, r.id)).json();
      expect(body.truncated_paths).toEqual(['docs/big.md', 'docs/small.md']);
      await putCtx(app, 'agents', agentId, r.id, ['docs/small.md']);
      expect((await getCtx(app, 'agents', agentId, r.id)).json().truncated_paths).toEqual([]);
      await app.close();
    });

    it('PUT never bumps agent or skill version (AC-36)', async () => {
      const r = await mkRepo();
      await put(r.dir, 'docs/a.md', 'a');
      const app = await makeApp();
      const agentId = await mkAgent(app);
      const skillId = await mkSkill(app);
      const versions = async () => ({
        a: (await db().select().from(t.agents).where(eq(t.agents.id, agentId)))[0]!.version,
        s: (await db().select().from(t.skills).where(eq(t.skills.id, skillId)))[0]!.version,
      });
      const before = await versions();
      await putCtx(app, 'agents', agentId, r.id, ['docs/a.md']);
      await putCtx(app, 'skills', skillId, r.id, ['docs/a.md']);
      expect(await versions()).toEqual(before);
      await app.close();
    });

    it('concurrent PUTs end in one of the two sets, no 500 (EC-6, EC-7)', async () => {
      const r = await mkRepo();
      await put(r.dir, 'docs/a.md', 'a');
      await put(r.dir, 'docs/b.md', 'b');
      const app = await makeApp();
      const agentId = await mkAgent(app);
      const setA = ['docs/a.md'];
      const setB = ['docs/b.md', 'docs/a.md'];
      const [x, y] = await Promise.all([
        putCtx(app, 'agents', agentId, r.id, setA),
        putCtx(app, 'agents', agentId, r.id, setB),
      ]);
      expect([x.statusCode, y.statusCode]).toEqual([200, 200]);
      const final = (await getCtx(app, 'agents', agentId, r.id)).json().attached.map((z: { path: string }) => z.path);
      expect([setA, setB]).toContainEqual(final);
      await app.close();
    });

    it('listing and editor requests make no LLM calls (NFR-2)', async () => {
      expect(llm.openai.calls).toEqual([]);
      expect(llm.anthropic.calls).toEqual([]);
      expect(llm.openrouter.calls).toEqual([]);
    });
  });

  describe('GET /repos/:id/context/file', () => {
    it('returns the content of a listed doc (AC-13)', async () => {
      const { id, dir } = await mkRepo();
      await put(dir, 'docs/a.md', '# Hello');
      const app = await makeApp();
      const res = await app.inject({ method: 'GET', url: `/repos/${id}/context/file?path=docs/a.md` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ path: 'docs/a.md', type: 'docs', content: '# Hello' });
      await app.close();
    });

    it('rejects traversal / absolute paths with 400 invalid_path (AC-12)', async () => {
      const { id } = await mkRepo();
      const app = await makeApp();
      for (const p of ['../x', '/etc/passwd', 'docs/../../x.md']) {
        const res = await app.inject({
          method: 'GET',
          url: `/repos/${id}/context/file?path=${encodeURIComponent(p)}`,
        });
        expect(res.statusCode, p).toBe(400);
        expect(res.json().error.code).toBe('invalid_path');
      }
      await app.close();
    });

    it('unlisted and symlinked docs are 404 context_doc_not_found (AC-12, AC-13)', async () => {
      const { id, dir } = await mkRepo();
      await put(dir, 'docs/real.md', 'real');
      await symlink(join(dir, 'docs/real.md'), join(dir, 'docs/link.md'));
      await put(dir, 'notes/x.md', 'x');
      const app = await makeApp();
      for (const p of ['docs/missing.md', 'docs/link.md', 'notes/x.md']) {
        const res = await app.inject({
          method: 'GET',
          url: `/repos/${id}/context/file?path=${encodeURIComponent(p)}`,
        });
        expect(res.statusCode, p).toBe(404);
        expect(res.json().error.code).toBe('context_doc_not_found');
      }
      await app.close();
    });
  });
});
