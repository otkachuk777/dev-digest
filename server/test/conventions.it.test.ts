import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const SHA = 'abc1234';
const FILE = 'export async function a() {\n  const r = await fetchUser(1);\n  return r;\n}';

/**
 * Conventions module — extract → persist → accept/edit/reject, with the evidence URL
 * pinned to the scanned commit and every read/write scoped to the caller's workspace.
 */
d('conventions module', () => {
  let pg: PgFixture;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const candidate = {
    category: 'style',
    rule: 'Use async/await',
    confidence: 0.9,
    evidence: {
      path: 'src/a.ts',
      start_line: 1,
      end_line: 3,
      snippet: 'const r = await fetchUser(1);\nreturn r;',
    },
  };

  function makeApp(candidates: unknown[] = [candidate]) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const repoIntel = { getConventionSamples: async () => ['src/a.ts'] } as unknown as RepoIntel;
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ head: SHA, files: { 'src/a.ts': FILE } }),
        github: new MockGitHubClient(),
        repoIntel,
        llm: { openrouter: new MockLLMProvider('openai', { structured: { candidates } }) },
      },
    });
  }

  it('extract persists verified candidates with a commit-pinned GitHub URL', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const scan = res.json();
    expect(scan.sample_count).toBe(1);
    expect(scan.items).toHaveLength(1);
    expect(scan.items[0]).toMatchObject({
      rule: 'Use async/await',
      evidence_path: 'src/a.ts',
      evidence_start: 2,
      evidence_end: 3,
      accepted: false,
      evidence_url: `https://github.com/acme/payments-api/blob/${SHA}/src/a.ts#L2-L3`,
    });

    const again = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(again.json().items).toHaveLength(1); // replaced, not duplicated
    const listed = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(listed.json().items).toHaveLength(1);
    await app.close();
  });

  it('drops candidates whose evidence is not in the file', async () => {
    const app = await makeApp([{ ...candidate, evidence: { ...candidate.evidence, snippet: 'promise.then(x => x)' } }]);
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
    await app.close();
  });

  it('PATCH accepts and edits; DELETE rejects and it stays gone', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json()
      .items[0].id as string;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/conventions/${id}`,
      payload: { accepted: true, rule: 'Prefer async/await over .then()' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ accepted: true, rule: 'Prefer async/await over .then()' });
    const listed = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(listed.json().items[0]).toMatchObject({ accepted: true });

    const del = await app.inject({ method: 'DELETE', url: `/conventions/${id}` });
    expect(del.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(after.json().items).toEqual([]);
    await app.close();
  });

  it('keeps a stable order across accepts when confidences tie', async () => {
    const app = await makeApp([
      candidate,
      { ...candidate, rule: 'Second rule', evidence: { ...candidate.evidence, snippet: 'const r = await fetchUser(1);' } },
    ]);
    const before = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json().items;
    expect(before).toHaveLength(2);
    await app.inject({ method: 'PATCH', url: `/conventions/${before[1].id}`, payload: { accepted: true } });
    const after = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json().items;
    expect(after.map((i: { id: string }) => i.id)).toEqual(before.map((i: { id: string }) => i.id));
    await app.close();
  });

  it('rejects an empty PATCH instead of pretending it changed something', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json()
      .items[0].id as string;
    expect((await app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload: {} })).statusCode).toBe(422);
    await app.close();
  });

  it("a repo or convention from another workspace reads as absent", async () => {
    const db = pg.handle.db;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other' }).returning();
    const [otherRepo] = await db
      .insert(t.repos)
      .values({ workspaceId: otherWs!.id, owner: 'x', name: 'y', fullName: 'x/y' })
      .returning();
    const [foreign] = await db
      .insert(t.conventions)
      .values({ workspaceId: otherWs!.id, repoId: otherRepo!.id, rule: 'secret rule' })
      .returning();

    const app = await makeApp();
    expect((await app.inject({ method: 'GET', url: `/repos/${otherRepo!.id}/conventions` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/repos/${otherRepo!.id}/conventions/extract` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PATCH', url: `/conventions/${foreign!.id}`, payload: { accepted: true } })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/conventions/${foreign!.id}` })).statusCode).toBe(404);
    const [still] = await db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.id, foreign!.id)));
    expect(still).toMatchObject({ rule: 'secret rule', accepted: false });
    await app.close();
  });
});
