import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest } from '../src/index.js';

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses the server's mock LLM + git so we exercise the real
 * assemble → completeStructured → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the MockGitClient diff) + one
  // hallucinated finding (line 999) the grounding gate must drop.
  const fixture = {
    verdict: 'request_changes',
    summary: 'secret key committed',
    score: 38,
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'sk_live in diff',
        confidence: 0.98,
        kind: 'finding',
      },
      {
        id: 'f-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom finding on a line not in the diff',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not real',
        confidence: 0.3,
        kind: 'finding',
      },
    ],
  };

  it('single-pass: assembles, grounds, drops the hallucinated finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();

    const events: string[] = [];
    const assembled: { index: number; count: number; names: string[] }[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      task: 'Review PR #482',
      onEvent: (e) => events.push(e.msg),
      onPromptAssembled: ({ index, count, sections }) =>
        assembled.push({ index, count, names: sections.map((s) => s.name) }),
    });

    // One prompt-assembly callback per LLM call, before it, with the sections.
    expect(assembled).toEqual([{ index: 0, count: 1, names: ['system', 'guard', 'task', 'diff'] }]);

    expect(outcome.mode).toBe('single-pass');
    expect(outcome.grounding).toBe('1/2 passed');
    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.start_line).toBe(11);
    expect(outcome.dropped).toHaveLength(1);
    // Score is derived from the SURVIVING findings, not the model's self-reported
    // 38: one CRITICAL remains after grounding ⇒ 100 − 35 = 65.
    expect(outcome.review.score).toBe(65);
    // progress is surfaced (server bridges this onto SSE; runner logs it)
    expect(events.some((m) => m.includes('Citation grounding'))).toBe(true);
    // No intent → the scope filter does not run and emits nothing.
    expect(events.some((m) => m.includes('Scope filter'))).toBe(false);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #5',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.score).toBe(100);
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('forwards sessionId to every LLM call (OpenRouter session grouping)', async () => {
    const seen: (string | undefined)[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seen.push(req.sessionId);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });

  it('with intent: scope-filters findings — WARNING out-of-scope dropped, CRITICAL kept as signal', async () => {
    const scoped = {
      verdict: 'request_changes',
      summary: 'mixed scope findings',
      score: 40,
      findings: [
        {
          id: 'in-scope-critical',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'sk_live in diff',
          confidence: 0.98,
          kind: 'finding',
          in_scope: true,
        },
        {
          id: 'out-of-scope-warning',
          severity: 'WARNING',
          category: 'style',
          title: 'Pre-existing style nit',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'unrelated to this PR',
          confidence: 0.5,
          kind: 'finding',
          in_scope: false,
        },
        {
          id: 'out-of-scope-critical',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Pre-existing SQL injection',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'unrelated to this PR',
          confidence: 0.7,
          kind: 'finding',
          in_scope: false,
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: scoped });
    const diff = await new MockGitClient().diff();
    const events: string[] = [];

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      intent: 'Summary: adds config\n\nIn scope:\n- config.ts',
      onEvent: (e) => events.push(e.msg),
    });

    const ids = outcome.review.findings.map((f) => f.id);
    expect(ids).toContain('in-scope-critical');
    expect(ids).not.toContain('out-of-scope-warning');
    // the out-of-scope CRITICAL survives, renamed, as the signal
    expect(ids).toContain('out-of-scope-critical');
    const signalFinding = outcome.review.findings.find((f) => f.id === 'out-of-scope-critical');
    expect(signalFinding?.title).toBe('(out of scope) Pre-existing SQL injection');
    expect(outcome.scopeDropped.map((f) => f.id)).toEqual(['out-of-scope-warning']);
    expect(events.some((m) => m.includes('scope filter dropped "Pre-existing style nit"'))).toBe(
      true,
    );
    expect(events.some((m) => m.includes('kept 1 critical as signal'))).toBe(true);
  });
});
