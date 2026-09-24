import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,3 @@
   port: 3000,
-  legacyFlag: "old_removed_line",
+  stripeKey: "sk_live_secret_body_line",
   redisUrl: x,`;

const REVIEW_FIXTURE = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      confidence: 0.95,
      kind: 'finding',
      in_scope: true,
    },
  ],
};

const INTENT_FIXTURE = {
  summary: 'Adds a config value per the linked plan.',
  in_scope: ['src/config.ts changes'],
  out_of_scope: [],
  missing_context: [],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `widgets-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      // links: a same-repo issue (#471) and a plan file (docs/plan.md).
      body: 'Closes #471. See docs/plan.md for the plan.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: DIFF.split('\n').slice(3).join('\n'),
  });
  return { repo: repo!, pr: pr! };
}

d('PR Intent (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(opts: {
    openrouter?: MockLLMProvider;
    github?: MockGitHubClient;
    secrets?: MockSecretsProvider;
  } = {}) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        secrets: opts.secrets ?? new MockSecretsProvider({}),
        ...(opts.github !== undefined ? { github: opts.github } : {}),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          ...(opts.openrouter ? { openrouter: opts.openrouter } : {}),
        },
      },
    });
  }

  it('derives + persists intent (head_sha, model), plan_file used, no diff bodies in the request, GET/POST both work', async () => {
    const github = new MockGitHubClient({ files: { 'docs/plan.md': 'The plan: add config safely.' } });
    const openrouter = new MockLLMProvider('openrouter', {
      structuredBySchema: { PrIntent: INTENT_FIXTURE },
    });
    const app = await appWith({ github, openrouter });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agentRes = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'You review code.' },
    });
    const agent = agentRes.json();

    const runRes = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(runRes.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    // The PrIntent classifier request never contains a diff body line ('+'/'-'
    // content), only the hunk header.
    const intentCalls = openrouter.calls.filter(
      (c) => (c.req as { schemaName?: string }).schemaName === 'PrIntent',
    );
    expect(intentCalls).toHaveLength(1);
    const messages = (intentCalls[0]!.req as { messages: { content: string }[] }).messages;
    const joined = messages.map((m) => m.content).join('\n');
    expect(joined).not.toContain('sk_live_secret_body_line');
    expect(joined).not.toContain('old_removed_line');
    expect(joined).not.toContain('port: 3000');
    expect(joined).toContain('@@ -10,3 +10,3 @@');
    expect(joined).toContain('The plan: add config safely.');

    // GET returns the persisted record with head_sha + model + plan_file used.
    const getRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(getRes.statusCode).toBe(200);
    const record = getRes.json();
    expect(record.head_sha).toBe(pr.headSha);
    expect(record.model).toBe('google/gemini-2.5-flash-lite');
    expect(record.sources.find((s: { kind: string; ref: string }) => s.kind === 'plan_file' && s.ref === 'docs/plan.md').status).toBe(
      'used',
    );

    // DB row exists directly.
    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row?.headSha).toBe(pr.headSha);
    expect(row?.model).toBe('google/gemini-2.5-flash-lite');

    // POST re-derives synchronously and returns 200.
    const postRes = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(postRes.statusCode).toBe(200);
    expect(postRes.json().head_sha).toBe(pr.headSha);

    // A second full review run does NOT call the classifier again — the stored
    // intent (same head_sha) is reused.
    const runRes2 = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(runRes2.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    const intentCallsAfter = openrouter.calls.filter(
      (c) => (c.req as { schemaName?: string }).schemaName === 'PrIntent',
    );
    // +1 from the manual POST re-derive above, but NOT +1 again from run #2.
    expect(intentCallsAfter).toHaveLength(2);

    await app.close();
  });

  it('without a usable classifier key, the review still completes and logs "Intent unavailable"', async () => {
    // No openrouter override AND no OPENROUTER_API_KEY in secrets → container.llm
    // throws a ConfigError before any network call.
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agentRes = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'You review code.' },
    });
    const agent = agentRes.json();

    const runRes = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = runRes.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run?.status).toBe('done');

    // `completeAgentRun` (status → done) lands before `saveRunTrace`, so wait
    // for the trace row itself or the read races the write under load.
    for (const start = Date.now(); Date.now() - start < 10_000; ) {
      const [tr] = await pg.handle.db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
      if (tr) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const traceRes = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    const trace = traceRes.json();
    expect(trace.log.some((l: { msg: string }) => l.msg.includes('Intent unavailable'))).toBe(true);

    // No intent row was persisted.
    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row).toBeUndefined();

    await app.close();
  });
});
