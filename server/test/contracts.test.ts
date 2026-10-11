import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  Risks,
  PrHistory,
  Risk,
  PrBrief,
  SmartDiff,
  Conformance,
  Onboarding,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  Skill,
  CreateSkillInput,
  AgentAttachedSkill,
  ContextDocTrace,
  RunEventKind,
  SetContextAttachmentsInput,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ summary: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: ['a.ts:3'] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('Conformance / Onboarding / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      Onboarding.parse({
        repo_full_name: 'o/r',
        commit_sha: 'abc',
        generated_at: '2026-10-02T00:00:00.000Z',
        status: 'skeleton',
        skeleton_reason: 'no_api_key',
        notes: [],
        files_total: 0,
        files_indexed: 0,
        provider: 'openrouter',
        model: 'm',
        llm_calls: 0,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: null,
        duration_ms: 1,
        dropped_items: 0,
        architecture: { body: 'b', diagram: null },
        critical_paths: [],
        how_to_run: [],
        reading_path: [],
        first_tasks: [],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, cost_usd: 0.06, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });

  it('Skill / CreateSkillInput / AgentAttachedSkill', () => {
    const skill = Skill.parse({
      id: 'skill-001',
      name: 'Security Rubric',
      description: 'Check for common security flaws',
      type: 'rubric',
      source: 'imported_file',
      body: 'Check for hardcoded secrets in the code...',
      enabled: false,
      version: 1,
      evidence_files: null,
      created_at: '2026-01-15T10:30:00Z',
    });
    expect(skill.type).toBe('rubric');
    expect(skill.created_at).toBe('2026-01-15T10:30:00Z');

    const createInput = CreateSkillInput.parse({
      name: 'My Skill',
      description: 'A custom skill',
      type: 'custom',
      body: 'The skill logic here',
    });
    expect(createInput.source).toBeUndefined();
    expect(createInput.enabled).toBeUndefined();

    const attached = AgentAttachedSkill.parse({
      agent_id: 'agent-001',
      skill_id: 'skill-001',
      order: 1,
      enabled: true,
      name: 'Security Rubric',
      description: 'Check for common security flaws',
      type: 'rubric',
      source: 'imported_file',
      skill_enabled: false,
    });
    expect(attached.enabled).toBe(true);
    expect(attached.skill_enabled).toBe(false);
  });
});

describe('Project Context contracts (SPEC-01)', () => {
  it('NFR-7: a pre-feature trace (no context_docs) still parses', () => {
    const trace = RunTrace.parse({
      config: { agent: 'a', model: 'm' },
      stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: null, findings: 0, grounding: '0/0' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [],
      raw_output: '{}',
      memory_pulled: [],
      specs_read: [],
      log: [],
    });
    expect(trace.context_docs).toBeUndefined();
  });

  it('AC-38: context_docs entries parse with all three statuses', () => {
    const doc = { path: 'specs/a.md', tokens: 3, origin: 'agent', origin_name: 'A' } as const;
    for (const status of ['read', 'truncated', 'missing'] as const) {
      expect(ContextDocTrace.parse({ ...doc, status }).status).toBe(status);
    }
  });

  it('AC-48: RunEventKind accepts warn', () => {
    expect(RunEventKind.parse('warn')).toBe('warn');
  });

  it('AC-18: SetContextAttachmentsInput rejects duplicate paths at the duplicate index', () => {
    const repo_id = '11111111-1111-4111-8111-111111111111';
    expect(SetContextAttachmentsInput.safeParse({ repo_id, paths: ['a.md', 'b.md'] }).success).toBe(true);
    const bad = SetContextAttachmentsInput.safeParse({ repo_id, paths: ['a.md', 'b.md', 'a.md'] });
    expect(bad.success).toBe(false);
    expect(!bad.success && bad.error.issues[0]?.path).toEqual(['paths', 2]);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

describe('PrBrief contract (SPEC-03)', () => {
  const brief = {
    summary: 's',
    intent: null,
    blast: null,
    risks: { risks: [] },
    review_focus: [{ file: 'a.ts', line: 3, reason: 'r' }],
    head_sha: 'abc',
    generated_at: '2026-10-03T10:00:00.000Z',
    provider: 'openrouter',
    model: 'm',
    llm_calls: 1,
    tokens_in: 1,
    tokens_out: 1,
    cost_usd: null,
    duration_ms: 5,
    missing: ['intent'],
    truncated: false,
    files_truncated: false,
    dropped_items: 0,
  };

  it('AC-57: Risk.kind is a closed set', () => {
    const risk = { kind: 'security', title: 't', explanation: 'e', severity: 'low', file_refs: ['a.ts'] };
    expect(Risk.safeParse(risk).success).toBe(true);
    expect(Risk.safeParse({ ...risk, kind: 'foo' }).success).toBe(false);
  });

  it('parses a valid brief; rejects legacy history and a missing summary', () => {
    expect(PrBrief.safeParse(brief).success).toBe(true);
    expect(PrBrief.safeParse({ ...brief, history: { history: [] } }).success).toBe(true); // zod strips unknown keys
    expect(PrBrief.parse({ ...brief, history: { history: [] } })).not.toHaveProperty('history');
    const { summary: _s, ...noSummary } = brief;
    expect(PrBrief.safeParse(noSummary).success).toBe(false);
  });
});
