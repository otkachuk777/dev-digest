import { describe, expect, it } from 'vitest';
import type {
  Agent,
  Repo,
  PrMeta,
  ActiveRun,
  RunSummary,
  ReviewRunResponse,
  ReviewRecord,
  ConventionScan,
} from '@devdigest/shared';
import type { DevDigestApi } from '../src/port.js';
import { DevDigestError } from '../src/errors.js';
import { getConventions, getFindings, listAgents, runAgentOnPr, waitForRun } from '../src/usecases.js';

const repo: Repo = {
  id: 'repo-1',
  workspace_id: 'ws-1',
  owner: 'owner',
  name: 'name',
  full_name: 'owner/name',
  default_branch: 'main',
  clone_path: null,
  last_polled_at: null,
  created_by: null,
};

const agent: Agent = {
  id: 'agent-1',
  name: 'Reviewer',
  description: 'desc',
  provider: 'openai',
  model: 'gpt-5',
  system_prompt: 'x',
  enabled: true,
  version: 1,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
  skill_count: 0,
};

const pr: PrMeta = {
  id: 'pr-1',
  number: 42,
  title: 'Title',
  author: 'alice',
  branch: 'feat',
  base: 'main',
  head_sha: 'abc',
  additions: 1,
  deletions: 1,
  files_count: 1,
  status: 'open',
};

/** Minimal in-memory fake implementing the port; tunable per test. */
class FakeApi implements DevDigestApi {
  runsQueue: RunSummary[][] = [];
  reviewsResult: ReviewRecord[] = [];
  activeRunsResult: ActiveRun[] = [];
  startReviewResult: ReviewRunResponse = { pr_id: 'pr-1', runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer' }], reviews: [] };
  startReviewCalls = 0;
  conventionsResult: ConventionScan = { items: [], sample_count: 0, scanned_at: null };

  async listAgents() {
    return [agent];
  }
  async listRepos() {
    return [repo];
  }
  async listPulls() {
    return [pr];
  }
  async activeRuns() {
    return this.activeRunsResult;
  }
  async startReview() {
    this.startReviewCalls += 1;
    return this.startReviewResult;
  }
  async runs() {
    return this.runsQueue.length > 1 ? this.runsQueue.shift()! : (this.runsQueue[0] ?? []);
  }
  async reviews() {
    return this.reviewsResult;
  }
  async conventions() {
    return this.conventionsResult;
  }
}

const doneReview: ReviewRecord = {
  id: 'rev-1',
  pr_id: 'pr-1',
  agent_id: 'agent-1',
  run_id: 'run-1',
  agent_name: 'Reviewer',
  kind: 'review',
  verdict: 'comment',
  summary: 'looks fine',
  score: 90,
  model: 'gpt-5',
  created_at: '2026-09-27T00:00:00Z',
  findings: [],
};

describe('waitForRun', () => {
  it('returns done as soon as the run leaves running', async () => {
    const api = new FakeApi();
    api.runsQueue = [[{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer', provider: null, model: null, status: 'done', error: null, duration_ms: null, tokens_in: null, tokens_out: null, cost_usd: null, findings_count: null, grounding: null, ran_at: null, score: 90, blockers: 0 }]];
    const result = await waitForRun(api, 'pr-1', 'run-1', { pollMs: 1, waitMs: 50 });
    expect(result.status).toBe('done');
  });

  it('times out to running under the hard cap without throwing', async () => {
    const api = new FakeApi();
    api.runsQueue = [[{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer', provider: null, model: null, status: 'running', error: null, duration_ms: null, tokens_in: null, tokens_out: null, cost_usd: null, findings_count: null, grounding: null, ran_at: null, score: null, blockers: null }]];
    const result = await waitForRun(api, 'pr-1', 'run-1', { pollMs: 5, waitMs: 20 });
    expect(result.status).toBe('running');
  });

  it('honors an abort signal and stops early', async () => {
    const api = new FakeApi();
    api.runsQueue = [[{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer', provider: null, model: null, status: 'running', error: null, duration_ms: null, tokens_in: null, tokens_out: null, cost_usd: null, findings_count: null, grounding: null, ran_at: null, score: null, blockers: null }]];
    const controller = new AbortController();
    controller.abort();
    const result = await waitForRun(api, 'pr-1', 'run-1', { pollMs: 1000, waitMs: 120_000, signal: controller.signal });
    expect(result.status).toBe('running');
  });
});

describe('runAgentOnPr', () => {
  it('attaches to an active run instead of POSTing a duplicate', async () => {
    const api = new FakeApi();
    api.activeRunsResult = [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer', ran_at: null }];
    api.runsQueue = [[{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer', provider: null, model: null, status: 'done', error: null, duration_ms: null, tokens_in: null, tokens_out: null, cost_usd: null, findings_count: null, grounding: null, ran_at: null, score: 90, blockers: 0 }]];
    api.reviewsResult = [doneReview];
    const result = await runAgentOnPr(api, { repo: 'owner/name', pr: 42, agent: 'Reviewer' }, { pollMs: 1, waitMs: 50 });
    expect(api.startReviewCalls).toBe(0);
    expect(result.status).toBe('done');
  });

  it('POSTs a new run when nothing is active, then returns done', async () => {
    const api = new FakeApi();
    api.runsQueue = [[{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer', provider: null, model: null, status: 'done', error: null, duration_ms: null, tokens_in: null, tokens_out: null, cost_usd: null, findings_count: null, grounding: null, ran_at: null, score: 90, blockers: 0 }]];
    api.reviewsResult = [doneReview];
    const result = await runAgentOnPr(api, { repo: 'owner/name', pr: 42, agent: 'Reviewer' }, { pollMs: 1, waitMs: 50 });
    expect(api.startReviewCalls).toBe(1);
    expect(result).toMatchObject({ status: 'done', run_id: 'run-1', verdict: 'comment', score: 90 });
  });

  it('returns a non-error running result on timeout, with a hint', async () => {
    const api = new FakeApi();
    api.runsQueue = [[{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer', provider: null, model: null, status: 'running', error: null, duration_ms: null, tokens_in: null, tokens_out: null, cost_usd: null, findings_count: null, grounding: null, ran_at: null, score: null, blockers: null }]];
    const result = await runAgentOnPr(api, { repo: 'owner/name', pr: 42, agent: 'Reviewer' }, { pollMs: 5, waitMs: 10 });
    expect(result).toMatchObject({ status: 'running', run_id: 'run-1' });
    expect((result as { hint: string }).hint).toContain('get_findings');
  });

  it('throws with a retry hint when the run failed', async () => {
    const api = new FakeApi();
    api.runsQueue = [[{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer', provider: null, model: null, status: 'failed', error: 'model timeout', duration_ms: null, tokens_in: null, tokens_out: null, cost_usd: null, findings_count: null, grounding: null, ran_at: null, score: null, blockers: null }]];
    await expect(
      runAgentOnPr(api, { repo: 'owner/name', pr: 42, agent: 'Reviewer' }, { pollMs: 1, waitMs: 50 }),
    ).rejects.toMatchObject({ kind: 'server' });
  });

  it('throws NotFound (via findAgent) when the agent name is unknown', async () => {
    const api = new FakeApi();
    await expect(
      runAgentOnPr(api, { repo: 'owner/name', pr: 42, agent: 'Nope' }, { pollMs: 1, waitMs: 50 }),
    ).rejects.toBeInstanceOf(DevDigestError);
  });
});

describe('getFindings', () => {
  it('returns the newest review when run_id is omitted', async () => {
    const api = new FakeApi();
    api.reviewsResult = [doneReview];
    const result = await getFindings(api, { repo: 'owner/name', pr: 42 });
    expect(result).toMatchObject({ status: 'done', run_id: 'run-1' });
  });

  it('returns a running hint for a run_id that is still in flight', async () => {
    const api = new FakeApi();
    api.reviewsResult = [];
    api.runsQueue = [[{ run_id: 'run-2', agent_id: 'agent-1', agent_name: 'Reviewer', provider: null, model: null, status: 'running', error: null, duration_ms: null, tokens_in: null, tokens_out: null, cost_usd: null, findings_count: null, grounding: null, ran_at: null, score: null, blockers: null }]];
    const result = await getFindings(api, { repo: 'owner/name', pr: 42, run_id: 'run-2' });
    expect(result).toMatchObject({ status: 'running', run_id: 'run-2' });
  });

  it('rejects an unknown run_id with a not_found error', async () => {
    const api = new FakeApi();
    api.reviewsResult = [];
    api.runsQueue = [[]];
    await expect(getFindings(api, { repo: 'owner/name', pr: 42, run_id: 'nope' })).rejects.toMatchObject({
      kind: 'not_found',
    });
  });

  it('caps findings at the requested limit', async () => {
    const api = new FakeApi();
    api.reviewsResult = [
      {
        ...doneReview,
        findings: Array.from({ length: 5 }, (_, i) => ({
          id: String(i),
          severity: 'WARNING' as const,
          category: 'bug' as const,
          title: 't',
          file: 'a.ts',
          start_line: 1,
          end_line: 2,
          rationale: 'r',
          confidence: 0.9,
        })),
      },
    ];
    const result = await getFindings(api, { repo: 'owner/name', pr: 42, limit: 2 });
    expect(result).toMatchObject({ status: 'done' });
    if (result.status === 'done') {
      expect(result.findings).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.truncated).toBe(true);
    }
  });
});

describe('getConventions', () => {
  it('returns only accepted conventions', async () => {
    const api = new FakeApi();
    api.conventionsResult = {
      items: [
        {
          id: 'c1',
          category: 'style',
          rule: 'use x',
          evidence_path: 'a.ts',
          evidence_start: 1,
          evidence_end: 2,
          evidence_snippet: 'x',
          evidence_url: 'https://example.com',
          confidence: 0.9,
          accepted: true,
        },
      ],
      sample_count: 1,
      scanned_at: '2026-09-27T00:00:00Z',
    };
    const result = await getConventions(api, { repo: 'owner/name' });
    expect(result.total).toBe(1);
  });

  it('throws not_found when there are no accepted conventions', async () => {
    const api = new FakeApi();
    await expect(getConventions(api, { repo: 'owner/name' })).rejects.toMatchObject({ kind: 'not_found' });
  });
});

describe('listAgents', () => {
  it('throws not_found when no agents are configured', async () => {
    class EmptyApi extends FakeApi {
      override async listAgents() {
        return [];
      }
    }
    await expect(listAgents(new EmptyApi())).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('returns shaped agents otherwise', async () => {
    const result = await listAgents(new FakeApi());
    expect(result.agents).toHaveLength(1);
  });
});
