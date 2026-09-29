import { describe, expect, it } from 'vitest';
import type { Agent, ConventionScan, Finding, Repo, PrMeta, ActiveRun, ReviewRecord } from '@devdigest/shared';
import { DevDigestError } from '../src/errors.js';
import { activeRunFor, findAgent, findPr, findRepo } from '../src/match.js';
import { capOutput, shapeAgents, shapeConventions, shapePrFindings, shapeReview } from '../src/shape.js';

const repo = (overrides: Partial<Repo> = {}): Repo => ({
  id: 'repo-1',
  workspace_id: 'ws-1',
  owner: 'owner',
  name: 'name',
  full_name: 'owner/name',
  default_branch: 'main',
  clone_path: null,
  last_polled_at: null,
  created_by: null,
  ...overrides,
});

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'agent-1',
  name: 'Reviewer',
  description: 'A reviewer agent',
  provider: 'openai',
  model: 'gpt-5',
  system_prompt: 'x',
  enabled: true,
  version: 1,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
  skill_count: 0,
  ...overrides,
});

const pr = (overrides: Partial<PrMeta> = {}): PrMeta => ({
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
  ...overrides,
});

const finding = (overrides: Partial<Finding> = {}): Finding => ({
  id: 'f1',
  severity: 'WARNING',
  category: 'bug',
  title: 'Title',
  file: 'a.ts',
  start_line: 1,
  end_line: 2,
  rationale: 'because reasons',
  confidence: 0.9,
  ...overrides,
});

const rec = (overrides: Partial<ReviewRecord> = {}): ReviewRecord => ({
  id: 'rev-1',
  pr_id: 'pr-1',
  agent_id: 'agent-1',
  run_id: 'run-1',
  agent_name: 'Reviewer',
  kind: 'review',
  verdict: 'comment',
  summary: 'ok',
  score: 80,
  model: 'gpt-5',
  created_at: '2026-09-27T00:00:00Z',
  findings: [],
  ...overrides,
});

describe('match', () => {
  it('findRepo matches by full_name', () => {
    const repos = [repo()];
    expect(findRepo(repos, 'owner/name')).toBe(repos[0]);
  });

  it('findRepo matches by uuid', () => {
    const repos = [repo({ id: '11111111-1111-1111-1111-111111111111' })];
    expect(findRepo(repos, '11111111-1111-1111-1111-111111111111')).toBe(repos[0]);
  });

  it('findRepo returns a NotFound error listing known repos', () => {
    const result = findRepo([repo()], 'missing/repo');
    expect(result).toBeInstanceOf(DevDigestError);
    expect((result as DevDigestError).kind).toBe('not_found');
    expect((result as DevDigestError).message).toContain('owner/name');
  });

  it('findPr matches by number', () => {
    const pulls = [pr({ number: 7 })];
    expect(findPr(pulls, 7)).toBe(pulls[0]);
  });

  it('findRepo ignores case', () => {
    const repos = [repo()];
    expect(findRepo(repos, 'Owner/Name')).toBe(repos[0]);
  });

  it('findPr returns NotFound listing known PR numbers', () => {
    const result = findPr([pr({ number: 7 }), pr({ number: 3 })], 8, 'owner/name');
    expect(result).toBeInstanceOf(DevDigestError);
    const msg = (result as DevDigestError).message;
    expect(msg).toContain('owner/name');
    expect(msg).toContain('#7');
    expect(msg).toContain('#3');
  });

  it('findAgent matches by name (any case) and lists known agents on miss', () => {
    const agents = [agent({ name: 'Reviewer' })];
    expect(findAgent(agents, 'Reviewer')).toBe(agents[0]);
    expect(findAgent(agents, 'reviewer')).toBe(agents[0]);
    const miss = findAgent(agents, 'Nope');
    expect(miss).toBeInstanceOf(DevDigestError);
    expect((miss as DevDigestError).message).toContain('list_agents');
    expect((miss as DevDigestError).message).toContain('Reviewer');
  });

  it('activeRunFor returns undefined (not an error) when nothing is in flight', () => {
    const active: ActiveRun[] = [];
    expect(activeRunFor(active, 'agent-1')).toBeUndefined();
  });

  it('activeRunFor returns the matching in-flight run', () => {
    const running: ActiveRun = { run_id: 'r1', agent_id: 'agent-1', agent_name: 'Reviewer', ran_at: null };
    expect(activeRunFor([running], 'agent-1')).toBe(running);
  });
});

describe('shape', () => {
  it('shapeAgents caps description at 120 chars', () => {
    const long = 'x'.repeat(200);
    const [shaped] = shapeAgents([agent({ description: long })]);
    expect(shaped!.description.length).toBe(120);
  });

  it('shapeAgents exposes the model', () => {
    expect(shapeAgents([agent({ model: 'gpt-5' })])[0]!.model).toBe('gpt-5');
  });

  it('shapePrFindings keeps only the latest review per agent', () => {
    const older = rec({ id: 'old', created_at: '2026-09-26T00:00:00Z', findings: [finding({ id: '1' }), finding({ id: '2' }), finding({ id: '3' })] });
    const newer = rec({ id: 'new', created_at: '2026-09-27T00:00:00Z', findings: [finding({ id: '4' })] });
    const shaped = shapePrFindings([older, newer]);
    expect(shaped.reviews).toHaveLength(1);
    expect(shaped.total_findings).toBe(1);
  });

  it('shapePrFindings counts before the per-agent limit', () => {
    const findings = [
      finding({ id: '1', severity: 'SUGGESTION' }),
      finding({ id: '2', severity: 'CRITICAL' }),
      finding({ id: '3', severity: 'SUGGESTION' }),
    ];
    const shaped = shapePrFindings([rec({ findings })], 1);
    expect(shaped.total_findings).toBe(3);
    expect(shaped.by_severity).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 2 });
    const r = shaped.reviews[0]!;
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.severity).toBe('CRITICAL');
    expect(r.total).toBe(3);
    expect(r.truncated).toBe(true);
  });

  it('shapePrFindings skips summary-kind rows', () => {
    const shaped = shapePrFindings([rec({ kind: 'summary', findings: [finding()] })]);
    expect(shaped.reviews).toHaveLength(0);
    expect(shaped.total_findings).toBe(0);
  });

  it('shapePrFindings groups by agent; a null agent_id is its own group', () => {
    const shaped = shapePrFindings([
      rec({ id: 'a', agent_id: 'agent-1' }),
      rec({ id: 'b', agent_id: 'agent-2' }),
      rec({ id: 'c', agent_id: null }),
      rec({ id: 'd', agent_id: null }),
    ]);
    expect(shaped.reviews).toHaveLength(4);
  });

  it('shapeReview sorts CRITICAL > WARNING > SUGGESTION and caps at limit', () => {
    const findings = [
      finding({ id: '1', severity: 'SUGGESTION' }),
      finding({ id: '2', severity: 'CRITICAL' }),
      finding({ id: '3', severity: 'WARNING' }),
    ];
    const shaped = shapeReview({ verdict: 'comment', summary: 'ok', score: 80, findings }, 2);
    expect(shaped.findings.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING']);
    expect(shaped.total).toBe(3);
    expect(shaped.truncated).toBe(true);
  });

  it('shapeReview truncates message and summary', () => {
    const longRationale = 'r'.repeat(500);
    const shaped = shapeReview({
      verdict: 'comment',
      summary: 's'.repeat(500),
      score: 80,
      findings: [finding({ rationale: longRationale })],
    });
    expect(shaped.findings[0]!.message.length).toBe(200);
    expect(shaped.summary!.length).toBe(300);
  });

  it('shapeConventions keeps only accepted candidates', () => {
    const scan: ConventionScan = {
      items: [
        {
          id: 'c1',
          category: 'style',
          rule: 'r'.repeat(300),
          evidence_path: 'a.ts',
          evidence_start: 1,
          evidence_end: 2,
          evidence_snippet: 'x',
          evidence_url: 'https://example.com',
          confidence: 0.9,
          accepted: true,
        },
        {
          id: 'c2',
          category: 'style',
          rule: 'unaccepted',
          evidence_path: 'b.ts',
          evidence_start: 1,
          evidence_end: 2,
          evidence_snippet: 'x',
          evidence_url: 'https://example.com',
          confidence: 0.9,
          accepted: false,
        },
      ],
      sample_count: 2,
      scanned_at: '2026-09-27T00:00:00Z',
    };
    const shaped = shapeConventions(scan);
    expect(shaped.total).toBe(1);
    expect(shaped.conventions).toHaveLength(1);
    expect(shaped.conventions[0]!.rule.length).toBe(200);
  });

  it('capOutput drops trailing findings until under the char budget', () => {
    const huge = Array.from({ length: 50 }, (_, i) =>
      finding({ id: String(i), file: 'x'.repeat(1000) }),
    );
    const shaped = shapeReview({ verdict: 'comment', summary: 'ok', score: 80, findings: huge }, 50);
    const capped = capOutput(shaped, 2000);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(2000);
    expect(capped.truncated).toBe(true);
  });
});
