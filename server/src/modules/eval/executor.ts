import { reviewPullRequest, type ReviewInput, type ReviewOutcome } from '@devdigest/reviewer-core';
import type { EvalCaseResult, EvalRunConfig, LLMProvider } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import type { EvalCaseRow } from '../../db/rows.js';
import { skillPromptBlocks } from '../reviews/index.js';
import { CASE_TIMEOUT_MS } from './constants.js';
import { scoreCase, scoreRun, type CaseScore } from './scoring.js';

/** The config frozen at run start; `source` is stored but not part of the API contract. */
export type RunSnapshot = Omit<EvalRunConfig, 'skills'> & {
  skills: (EvalRunConfig['skills'][number] & { source: string })[];
};

interface AgentLike { provider: EvalRunConfig['provider']; model: string; systemPrompt: string; strategy: EvalRunConfig['strategy'] | null }
interface LinkLike {
  enabled: boolean;
  skill: { id: string; name: string; version: number; body: string; source: string; enabled: boolean };
}

/** AC-37: only skills enabled on the link AND on the skill itself. */
export function buildSnapshot(agent: AgentLike, links: LinkLike[]): RunSnapshot {
  return {
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    // Same default as the live review (`reviews/constants.ts` REVIEW_STRATEGY).
    strategy: agent.strategy ?? 'single-pass',
    skills: links
      .filter((l) => l.enabled && l.skill.enabled)
      .map(({ skill: s }) => ({ skill_id: s.id, name: s.name, version: s.version, body: s.body, source: s.source })),
  };
}

export interface CaseOutcome {
  result: EvalCaseResult;
  score: CaseScore;
  tokensIn: number;
  tokensOut: number;
  llmCalls: number;
}

type ReviewFn = (input: ReviewInput) => Promise<ReviewOutcome>;
const EVAL_TASK =
  'Review this pull request. Report only the distinct, high-value findings you can defend, each citing an exact file and line range that appears in the diff. Zero findings is a valid result.';

/** AC-38: the frozen diff + PR text + snapshot config go in, nothing else (no intent, repo-intel, context or memory). */
export async function runCase(a: {
  snapshot: RunSnapshot;
  evalCase: EvalCaseRow;
  llm: LLMProvider;
  review?: ReviewFn;
  timeoutMs?: number;
  now?: () => number;
}): Promise<CaseOutcome> {
  const { snapshot, evalCase: c, llm, review = reviewPullRequest, timeoutMs = CASE_TIMEOUT_MS, now = Date.now } = a;
  const items = c.expected as { file: string; start_line: number; end_line: number }[];
  const start = now();
  const timeoutMsg = `timed out after ${Math.round(timeoutMs / 1000)} s`;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(timeoutMsg));
    }, timeoutMs);
  });
  const base = { case_id: c.id, case_name: c.name, expectation_type: c.expectationType, ran_at: new Date(start).toISOString() };
  try {
    const meta = c.inputMeta as { title?: string; body?: string };
    const prDescription = [meta.title, meta.body].map((x) => (x ?? '').trim()).filter(Boolean).join('\n\n');
    // `timeoutMs` on the provider does not bound the call (server/INSIGHTS.md): race it,
    // and let `checkCancelled` stop a late chunk once the timer has fired.
    const outcome = await Promise.race([
      review({
        systemPrompt: snapshot.system_prompt,
        model: snapshot.model,
        strategy: snapshot.strategy,
        skills: skillPromptBlocks(
          snapshot.skills.map((s) => ({ enabled: true, skill: { name: s.name, body: s.body, source: s.source, enabled: true } })),
        ),
        diff: parseUnifiedDiff(c.inputDiff),
        ...(prDescription ? { prDescription } : {}),
        task: EVAL_TASK,
        llm,
        checkCancelled: () => {
          if (timedOut) throw new Error(timeoutMsg);
        },
      }),
      timeout,
    ]);
    const kept = outcome.review.findings.map((f) => ({
      file: f.file, start_line: f.start_line, end_line: f.end_line, severity: f.severity, category: f.category, title: f.title,
    }));
    const s = scoreCase(c.expectationType, items, kept, outcome.dropped.length);
    const costUsd = outcome.costUsd ?? null;
    return {
      result: {
        ...base, status: s.status, expected_count: s.expectedCount, matched_count: s.matchedCount,
        findings: kept, dropped_count: s.dropped, error: null, duration_ms: now() - start, cost_usd: costUsd,
      },
      score: { ...s, type: c.expectationType, costUsd },
      tokensIn: outcome.tokensIn,
      tokensOut: outcome.tokensOut,
      llmCalls: outcome.chunks.length,
    };
  } catch (err) {
    const expectedCount = c.expectationType === 'must_find' ? items.length : 0;
    return {
      result: {
        ...base, status: 'error', expected_count: expectedCount, matched_count: 0, findings: [], dropped_count: 0,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 500), duration_ms: now() - start, cost_usd: null,
      },
      score: { type: c.expectationType, status: 'error', expectedCount, matchedCount: 0, tp: 0, fp: 0, kept: 0, dropped: 0, costUsd: null },
      tokensIn: 0, tokensOut: 0, llmCalls: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface RunFinish {
  status: 'done' | 'failed';
  error: string | null;
  finishedAt: Date;
  passed: number;
  errored: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
  durationMs: number;
  llmCalls: number;
  tokensIn: number;
  tokensOut: number;
}

/** Persistence the suite needs; each method is one small write (no wrapping tx). */
export interface SuiteRepo {
  insertCaseResult(runId: string, c: { caseId: string; caseName: string; result: EvalCaseResult }): Promise<void>;
  setLastResult(workspaceId: string, caseId: string, result: EvalCaseResult): Promise<void>;
  bumpCasesDone(runId: string): Promise<void>;
  finishRun(runId: string, fields: RunFinish): Promise<void>;
}

/**
 * Runs every case, persisting each result right after its call (a crash keeps the
 * finished cases). The run's metrics and terminal status go in ONE final update,
 * written LAST — pollers treat `done` as "everything is readable" (server/INSIGHTS.md).
 * Never rejects: a failure becomes a `failed` run.
 */
export async function runSuite(a: {
  runId: string;
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  snapshot: RunSnapshot;
  cases: EvalCaseRow[];
  llm: LLMProvider;
  repo: SuiteRepo;
  log: (fields: Record<string, unknown>) => void;
  review?: ReviewFn;
  timeoutMs?: number;
  /** Backoff before each retry of the final write (default 200/500/1000 ms). */
  retryDelaysMs?: number[];
  logError?: (fields: Record<string, unknown>) => void;
}): Promise<void> {
  const started = Date.now();
  const scores: CaseScore[] = [];
  let tokensIn = 0, tokensOut = 0, llmCalls = 0;
  const finish = async (status: 'done' | 'failed', error: string | null) => {
    const m = scoreRun(scores);
    const fields: RunFinish = {
      status, error, finishedAt: new Date(), passed: m.passed, errored: m.errored, recall: m.recall,
      precision: m.precision, citationAccuracy: m.citationAccuracy, costUsd: m.costUsd,
      durationMs: Date.now() - started, llmCalls, tokensIn, tokensOut,
    };
    // A lost final write leaves the run `running` and blocks the agent: retry, then say so loudly.
    const delays = a.retryDelaysMs ?? [200, 500, 1000];
    for (let attempt = 0; ; attempt++) {
      try {
        await a.repo.finishRun(a.runId, fields);
        break;
      } catch (err) {
        if (attempt >= delays.length) {
          a.logError?.({ run_id: a.runId, err: (err as Error).message });
          throw err;
        }
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
    }
    a.log({
      run_id: a.runId, agent_id: a.agentId, agent_version: a.agentVersion, status, total: a.cases.length,
      passed: m.passed, errored: m.errored, llm_calls: llmCalls, tokens_in: tokensIn, tokens_out: tokensOut,
      recall: m.recall, precision: m.precision, citation_accuracy: m.citationAccuracy,
      cost_usd: m.costUsd, duration_ms: fields.durationMs,
    });
  };
  try {
    for (const c of a.cases) {
      const o = await runCase({ snapshot: a.snapshot, evalCase: c, llm: a.llm, ...(a.review ? { review: a.review } : {}), ...(a.timeoutMs ? { timeoutMs: a.timeoutMs } : {}) });
      await a.repo.insertCaseResult(a.runId, { caseId: c.id, caseName: c.name, result: o.result });
      await a.repo.setLastResult(a.workspaceId, c.id, o.result);
      await a.repo.bumpCasesDone(a.runId);
      scores.push(o.score);
      tokensIn += o.tokensIn; tokensOut += o.tokensOut; llmCalls += o.llmCalls;
    }
    const allErrored = scores.length > 0 && scores.every((s) => s.status === 'error');
    await finish(allErrored ? 'failed' : 'done', allErrored ? 'all cases errored' : null);
  } catch (err) {
    await finish('failed', (err as Error).message).catch(() => {});
  }
}
