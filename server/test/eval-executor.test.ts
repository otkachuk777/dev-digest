import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReviewInput, ReviewOutcome } from '@devdigest/reviewer-core';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { buildSnapshot, runCase, runSuite, type SuiteRepo } from '../src/modules/eval/executor.js';
import { fileDiffFragment } from '../src/modules/eval/helpers.js';

const PATCH = '@@ -1,2 +10,3 @@\n a\n+b\n c';
const caseRow = (name: string, type: 'must_find' | 'must_not_flag' = 'must_find') =>
  ({
    id: `id-${name}`, agentId: 'ag', workspaceId: 'ws', name, expectationType: type,
    expected: [{ file: 'src/a.ts', start_line: 10, end_line: 12 }],
    inputDiff: fileDiffFragment('src/a.ts', PATCH), inputMeta: { title: 'T', body: 'B' },
  }) as never;
const link = (name: string, o: { link?: boolean; skill?: boolean } = {}) => ({
  enabled: o.link ?? true,
  order: 0,
  skill: { id: `sk-${name}`, name, version: 3, body: `body ${name}`, source: 'manual', enabled: o.skill ?? true },
});
const agent = { provider: 'openai', model: 'm', systemPrompt: 'sys', strategy: null, version: 4 } as never;
const snapshot = buildSnapshot(agent, [link('a'), link('b', { link: false }), link('c', { skill: false })] as never);

const finding = { file: 'src/a.ts', start_line: 11, end_line: 11, severity: 'CRITICAL', category: 'security', title: 't' };
const outcome = (findings: unknown[] = [finding]) =>
  ({ review: { findings }, dropped: [{}], chunks: [{ label: 'x' }, { label: 'y' }], tokensIn: 10, tokensOut: 5, costUsd: 0.01 }) as unknown as ReviewOutcome;
const llm = new MockLLMProvider('openai');

function fakeRepo() {
  const calls: string[] = [];
  const repo: SuiteRepo = {
    insertCaseResult: async () => void calls.push('result'),
    setLastResult: async () => void calls.push('last'),
    bumpCasesDone: async () => void calls.push('bump'),
    finishRun: async (_id, f) => void calls.push(`finish:${f.status}`),
  };
  return { repo, calls };
}

afterEach(() => vi.useRealTimers());

describe('eval executor', () => {
  it('AC-37: snapshot keeps only skills enabled on the link and the skill, with name/version/body', () => {
    expect(snapshot.skills).toEqual([{ skill_id: 'sk-a', name: 'a', version: 3, body: 'body a', source: 'manual' }]);
    expect(snapshot).toMatchObject({ provider: 'openai', model: 'm', system_prompt: 'sys', strategy: 'single-pass' });
  });

  it('AC-38 / NFR-3: review gets only the allowed keys, once per case, with snapshot skills', async () => {
    const review = vi.fn(async (_i: ReviewInput) => outcome());
    const r = await runCase({ snapshot, evalCase: caseRow('x'), llm, review });
    expect(review).toHaveBeenCalledTimes(1);
    const input = review.mock.calls[0]![0];
    expect(Object.keys(input).sort()).toEqual(
      ['checkCancelled', 'diff', 'llm', 'model', 'prDescription', 'skills', 'strategy', 'systemPrompt', 'task'].sort(),
    );
    expect(input.skills).toEqual(['body a']);
    expect(input.prDescription).toBe('T\n\nB');
    expect(r.result).toMatchObject({ status: 'pass', matched_count: 1, expected_count: 1, cost_usd: 0.01, dropped_count: 1 });
    expect(r).toMatchObject({ tokensIn: 10, tokensOut: 5, llmCalls: 2 });
  });

  it('AC-39 / NFR-1: scoring uses no LLM (mock sees zero calls)', async () => {
    const r = await runCase({ snapshot, evalCase: caseRow('x', 'must_not_flag'), llm, review: async () => outcome() });
    expect(r.result.status).toBe('fail');
    expect(llm.calls).toHaveLength(0);
  });

  it('AC-40: a rejecting review becomes an error result; the suite continues', async () => {
    const { repo, calls } = fakeRepo();
    const review = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(outcome());
    await runSuite({ runId: 'r', workspaceId: 'ws', agentId: 'ag', agentVersion: 4, snapshot, cases: [caseRow('a'), caseRow('b')], llm, repo, log: () => {}, review });
    expect(review).toHaveBeenCalledTimes(2);
    expect(calls.filter((c) => c === 'result')).toHaveLength(2);
    expect(calls.at(-1)).toBe('finish:done');
  });

  it('AC-40: a never-resolving review times out after 120 s and checkCancelled then throws', async () => {
    vi.useFakeTimers();
    let input!: ReviewInput;
    const review = (i: ReviewInput) => ((input = i), new Promise<ReviewOutcome>(() => {}));
    const p = runCase({ snapshot, evalCase: caseRow('x'), llm, review });
    await vi.advanceTimersByTimeAsync(120_000);
    const r = await p;
    expect(r.result).toMatchObject({ status: 'error', error: 'timed out after 120 s' });
    expect(() => input.checkCancelled!()).toThrow(/timed out/);
  });

  it('AC-41 / EC-10: the terminal status is the last write; all errored → failed', async () => {
    const ok = fakeRepo();
    await runSuite({ runId: 'r', workspaceId: 'ws', agentId: 'ag', agentVersion: 4, snapshot, cases: [caseRow('a'), caseRow('b')], llm, repo: ok.repo, log: () => {}, review: async () => outcome() });
    expect(ok.calls).toEqual(['result', 'last', 'bump', 'result', 'last', 'bump', 'finish:done']);
    const bad = fakeRepo();
    await runSuite({ runId: 'r', workspaceId: 'ws', agentId: 'ag', agentVersion: 4, snapshot, cases: [caseRow('a')], llm, repo: bad.repo, log: () => {}, review: async () => { throw new Error('x'); } });
    expect(bad.calls.at(-1)).toBe('finish:failed');
  });

  it('NFR-6: one log line carries every field', async () => {
    const { repo } = fakeRepo();
    const log = vi.fn();
    await runSuite({ runId: 'r', workspaceId: 'ws', agentId: 'ag', agentVersion: 4, snapshot, cases: [caseRow('a')], llm, repo, log, review: async () => outcome() });
    expect(log).toHaveBeenCalledTimes(1);
    expect(Object.keys(log.mock.calls[0]![0]).sort()).toEqual(
      ['agent_id', 'agent_version', 'citation_accuracy', 'cost_usd', 'duration_ms', 'errored', 'llm_calls', 'passed', 'precision', 'recall', 'run_id', 'status', 'tokens_in', 'tokens_out', 'total'],
    );
  });

  it('an unexpected throw outside a case → failed with the message', async () => {
    const { repo, calls } = fakeRepo();
    repo.setLastResult = async () => { throw new Error('db down'); };
    const finish = vi.spyOn(repo, 'finishRun');
    await runSuite({ runId: 'r', workspaceId: 'ws', agentId: 'ag', agentVersion: 4, snapshot, cases: [caseRow('a')], llm, repo, log: () => {}, review: async () => outcome() });
    expect(finish.mock.calls[0]![1]).toMatchObject({ status: 'failed', error: 'db down' });
    expect(calls.at(-1)).toBe('finish:failed');
  });
  it('F5: the final write is retried; finishRun failing twice then succeeding still ends the run done', async () => {
    const { repo } = fakeRepo();
    const finish = vi.fn().mockRejectedValueOnce(new Error('blip')).mockRejectedValueOnce(new Error('blip')).mockResolvedValue(undefined);
    repo.finishRun = finish;
    const logError = vi.fn();
    await runSuite({ runId: 'r', workspaceId: 'ws', agentId: 'ag', agentVersion: 4, snapshot, cases: [caseRow('a')], llm, repo, log: () => {}, logError, retryDelaysMs: [0, 0, 0], review: async () => outcome() });
    expect(finish).toHaveBeenCalledTimes(3);
    expect(finish.mock.calls[2]![1]).toMatchObject({ status: 'done' });
    expect(logError).not.toHaveBeenCalled();
  });

  it('F5: when every retry fails, the error is logged at error level and the run never rejects', async () => {
    const { repo } = fakeRepo();
    repo.finishRun = vi.fn().mockRejectedValue(new Error('db down'));
    const logError = vi.fn();
    await expect(
      runSuite({ runId: 'r', workspaceId: 'ws', agentId: 'ag', agentVersion: 4, snapshot, cases: [caseRow('a')], llm, repo, log: () => {}, logError, retryDelaysMs: [0, 0, 0], review: async () => outcome() }),
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
  });
});
