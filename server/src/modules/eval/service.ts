import { isDeepStrictEqual } from 'node:util';
import { EvalCaseInput, EvalRange } from '@devdigest/shared';
import type {
  Agent, EvalCase, EvalCaseFromFindingResult, EvalCaseResult, EvalDashboard, EvalExpectationItem, EvalRunAllResult,
  EvalRunDetail, EvalRunRecord, EvalSkipReason, UnifiedDiff,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { classifyLlmError } from '../../platform/llm-errors.js';
import { AgentsService } from '../agents/index.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { MAX_CASES_PER_AGENT, MAX_DIFF_BYTES, STALE_RUN_MS } from './constants.js';
import { buildSnapshot, runCase, runSuite } from './executor.js';
import {
  caseNameFor, fileDiffFragment, rangeHasNewLine, rangeStart, toCaseDto, toRunDetailDto, toRunRecordDto, validateCaseInput,
} from './helpers.js';
import { EvalRepository, isUniqueViolation } from './repository.js';

const conflict = (code: string, message: string) => new AppError(code, message, 409);
const duplicateName = (name: string) =>
  conflict('duplicate_case_name', `A case named ${name} already exists for this agent.`);
/** Structural logger so routes can pass `req.log` and server.ts `app.log`. */
export interface EvalLog { info(obj: object, msg: string): void; error(obj: object, msg: string): void }

const SKIP_ERRORS: Record<Exclude<EvalSkipReason, 'disabled' | 'provider_error'>, () => AppError> = {
  no_eval_cases: () => conflict('no_eval_cases', 'Add an eval case first.'),
  eval_run_in_progress: () => conflict('eval_run_in_progress', 'An eval run is already in progress for this agent.'),
  no_api_key: () => new AppError('no_api_key', "No API key is configured for this agent's provider.", 400),
};
const invalid = (field: string, message: string) => new AppError('invalid_eval_case', message, 400, { field });

function tryParseDiff(text: string): UnifiedDiff | null {
  try {
    return parseUnifiedDiff(text);
  } catch {
    return null;
  }
}

export class EvalService {
  private repo: EvalRepository;
  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
  }

  private async requireAgent(workspaceId: string, agentId: string) {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  /** Zod + AC-27 rules → 400 `invalid_eval_case` with the offending field (`expected…` for item errors). */
  private parseInput(body: unknown): { input: EvalCaseInput; diffText: string } {
    const parsed = EvalCaseInput.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw invalid(issue.path.join('.') || 'body', issue.message);
    }
    const input = parsed.data;
    const diff = tryParseDiff(input.input_diff);
    const err = validateCaseInput(input, diff, Buffer.byteLength(input.input_diff, 'utf8'));
    if (err) throw invalid(err.field, err.message);
    return { input, diffText: input.input_diff };
  }

  async listCases(workspaceId: string, agentId: string): Promise<EvalCase[]> {
    await this.requireAgent(workspaceId, agentId);
    return (await this.repo.listCases(workspaceId, agentId)).map(toCaseDto);
  }

  async createFromFinding(workspaceId: string, findingId: string): Promise<EvalCaseFromFindingResult> {
    const src = await this.repo.findingForCase(workspaceId, findingId);
    if (!src) throw new NotFoundError('Finding not found');
    const { finding } = src;
    if (!finding.acceptedAt && !finding.dismissedAt) throw conflict('finding_undecided', 'Accept or dismiss the finding first.');
    const agent = src.agentId ? await this.container.agentsRepo.getById(workspaceId, src.agentId) : undefined;
    if (!agent) throw conflict('agent_missing', 'The agent that produced this finding no longer exists.');

    const existing = await this.repo.caseBySourceFinding(workspaceId, agent.id, findingId);
    if (existing) return { case: toCaseDto(existing), created: false };

    const notInDiff = () =>
      conflict('finding_not_in_diff', "This finding's lines are no longer in the PR's stored diff.");
    if (!src.patch) throw notInDiff();
    const inputDiff = fileDiffFragment(finding.file, src.patch);
    const diff = tryParseDiff(inputDiff);
    if (!diff || !rangeHasNewLine(diff, finding.file, finding.startLine, finding.endLine)) throw notInDiff();
    if (Buffer.byteLength(inputDiff, 'utf8') > MAX_DIFF_BYTES) {
      throw new AppError('case_input_too_large', "This finding's file diff is larger than 200 KB.", 422);
    }

    const cases = await this.repo.listCases(workspaceId, agent.id);
    if (cases.length >= MAX_CASES_PER_AGENT) throw conflict('case_limit_reached', 'An agent can have at most 50 eval cases.');

    const decision = finding.acceptedAt ? 'accepted' : 'dismissed';
    const row = await this.repo.insertCase({
      workspaceId,
      agentId: agent.id,
      name: caseNameFor(decision, finding.title, cases.map((c) => c.name)),
      expectationType: decision === 'accepted' ? 'must_find' : 'must_not_flag',
      expected: [
        {
          file: finding.file,
          start_line: finding.startLine,
          end_line: finding.endLine,
          severity: finding.severity,
          category: finding.category,
          title: finding.title,
        },
      ] satisfies EvalExpectationItem[],
      inputDiff,
      inputMeta: { title: src.prTitle.slice(0, 300), body: (src.prBody ?? '').slice(0, 10000) },
      sourceFindingId: findingId,
      sourceDecision: decision,
    });
    if (row) return { case: toCaseDto(row), created: true };
    // Lost a race (EC-1): the same finding won the unique index, or the name was taken.
    const winner = await this.repo.caseBySourceFinding(workspaceId, agent.id, findingId);
    if (winner) return { case: toCaseDto(winner), created: false };
    throw conflict('duplicate_case_name', 'A case with this name already exists for this agent.');
  }

  async createCase(workspaceId: string, agentId: string, body: unknown): Promise<EvalCase> {
    await this.requireAgent(workspaceId, agentId);
    const { input } = this.parseInput(body);
    const cases = await this.repo.listCases(workspaceId, agentId);
    if (cases.length >= MAX_CASES_PER_AGENT) throw conflict('case_limit_reached', 'An agent can have at most 50 eval cases.');
    const row = await this.repo.insertCase({
      workspaceId,
      agentId,
      name: input.name,
      expectationType: input.expectation_type ?? 'must_find',
      expected: input.expected,
      inputDiff: input.input_diff,
      inputMeta: input.input_meta,
      sourceFindingId: null,
      sourceDecision: null,
    });
    if (!row) throw duplicateName(input.name);
    return toCaseDto(row);
  }

  async updateCase(workspaceId: string, id: string, body: unknown): Promise<EvalCase> {
    const current = await this.repo.getCase(workspaceId, id);
    if (!current) throw new NotFoundError('Case not found');
    const { input } = this.parseInput(body);
    if (await this.repo.nameTaken(workspaceId, current.agentId, input.name, id)) throw duplicateName(input.name);
    // AC-34: a changed diff, meta or expectation makes the stored result stale. AC-35: the type never changes.
    const changed =
      current.inputDiff !== input.input_diff ||
      !isDeepStrictEqual(current.inputMeta, input.input_meta) ||
      !isDeepStrictEqual(current.expected, input.expected);
    try {
      const row = await this.repo.updateCase(workspaceId, id, {
        name: input.name,
        expected: input.expected,
        inputDiff: input.input_diff,
        inputMeta: input.input_meta,
        ...(changed ? { lastResult: null } : {}),
      });
      if (!row) throw new NotFoundError('Case not found');
      return toCaseDto(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateName(input.name);
      throw err;
    }
  }

  async deleteCase(workspaceId: string, id: string): Promise<void> {
    if (!(await this.repo.deleteCase(workspaceId, id))) throw new NotFoundError('Case not found');
  }

  // ---- runs ----

  /** The agent's provider, or null when its API key is missing (checked AFTER the in-progress guard). */
  private async providerOrNull(provider: Parameters<Container['llm']>[0]) {
    try {
      return await this.container.llm(provider);
    } catch (err) {
      if (classifyLlmError(err) === 'no_api_key') return null;
      throw err;
    }
  }

  /** A live `running` row blocks a new run; one older than any suite can last is a lost final write — reap it first. */
  private async inFlight(workspaceId: string, agentId: string): Promise<boolean> {
    await this.repo.reapStaleForAgent(workspaceId, agentId, new Date(Date.now() - STALE_RUN_MS));
    return this.repo.hasRunningRun(workspaceId, agentId);
  }

  private async snapshotOf(workspaceId: string, agent: Awaited<ReturnType<EvalService['requireAgent']>>) {
    return buildSnapshot(agent, await this.container.agentsRepo.linkedSkills(workspaceId, agent.id));
  }

  /** Starts a suite run, or says why not. Order: no cases → in progress → no key → insert (AC-42, amendment 3). */
  private async begin(workspaceId: string, agent: Awaited<ReturnType<EvalService['requireAgent']>>, log: EvalLog): Promise<EvalRunRecord | Exclude<EvalSkipReason, 'disabled' | 'provider_error'>> {
    const cases = await this.repo.listCases(workspaceId, agent.id);
    if (cases.length === 0) return 'no_eval_cases';
    if (await this.inFlight(workspaceId, agent.id)) return 'eval_run_in_progress';
    const llm = await this.providerOrNull(agent.provider);
    if (!llm) return 'no_api_key';
    const snapshot = await this.snapshotOf(workspaceId, agent);
    const row = await this.repo.insertRun({
      workspaceId, agentId: agent.id, agentVersion: agent.version, status: 'running', config: snapshot, total: cases.length,
    });
    if (!row) return 'eval_run_in_progress';
    // Fire and forget (AC-36): runSuite never rejects, and every result is persisted as it lands.
    void runSuite({
      runId: row.id, workspaceId, agentId: agent.id, agentVersion: agent.version, snapshot, cases, llm,
      repo: this.repo, log: (fields) => log.info(fields, 'eval run finished'),
      logError: (fields) => log.error(fields, 'eval run final write failed'),
    });
    return toRunRecordDto(row);
  }

  async startRun(workspaceId: string, agentId: string, log: EvalLog): Promise<EvalRunRecord> {
    const out = await this.begin(workspaceId, await this.requireAgent(workspaceId, agentId), log);
    if (typeof out === 'string') throw SKIP_ERRORS[out]();
    return out;
  }

  async runAll(workspaceId: string, log: EvalLog): Promise<EvalRunAllResult> {
    const result: EvalRunAllResult = { started: [], skipped: [] };
    for (const agent of await this.container.agentsRepo.list(workspaceId)) {
      let out: Awaited<ReturnType<EvalService['begin']>> | 'disabled' | 'provider_error';
      try {
        out = agent.enabled ? await this.begin(workspaceId, agent, log) : 'disabled';
      } catch (err) {
        // One agent's setup failure must not abort the loop after earlier agents already started.
        log.error({ agent_id: agent.id, err: (err as Error).message }, 'eval run-all: agent skipped');
        out = 'provider_error';
      }
      if (typeof out === 'string') result.skipped.push({ agent_id: agent.id, agent_name: agent.name, reason: out });
      else result.started.push(out);
    }
    return result;
  }

  /** AC-30: one case, synchronously; writes only `last_result` — no run row. */
  async runOneCase(workspaceId: string, caseId: string): Promise<EvalCaseResult> {
    const evalCase = await this.repo.getCase(workspaceId, caseId);
    if (!evalCase) throw new NotFoundError('Case not found');
    const agent = await this.requireAgent(workspaceId, evalCase.agentId);
    if (await this.inFlight(workspaceId, agent.id)) throw SKIP_ERRORS.eval_run_in_progress();
    const llm = await this.providerOrNull(agent.provider);
    if (!llm) throw SKIP_ERRORS.no_api_key();
    const { result } = await runCase({ snapshot: await this.snapshotOf(workspaceId, agent), evalCase, llm });
    await this.repo.setLastResult(workspaceId, caseId, result);
    return result;
  }

  /** AC-46. Called from server.ts before listen, never from buildApp. */
  reapInterrupted(): Promise<number> {
    return this.repo.reapInterrupted();
  }

  // ---- reads ----

  async listRuns(workspaceId: string, agentId: string, range: unknown): Promise<EvalRunRecord[]> {
    await this.requireAgent(workspaceId, agentId);
    const parsed = EvalRange.safeParse(range ?? '30d');
    if (!parsed.success) throw new AppError('invalid_range', 'range must be one of 7d, 30d, 90d, all', 400);
    return (await this.repo.listRuns(workspaceId, agentId, rangeStart(parsed.data, new Date()))).map(toRunRecordDto);
  }

  async getRun(workspaceId: string, id: string): Promise<EvalRunDetail> {
    const run = await this.repo.getRun(workspaceId, id);
    if (!run) throw new NotFoundError('Run not found');
    const detail = toRunDetailDto(run, await this.repo.runResults(run.id));
    // `source` is stored for the prompt only; the contract leaves it out.
    detail.config = { ...detail.config, skills: detail.config.skills.map(({ skill_id, name, version, body }) => ({ skill_id, name, version, body })) };
    return detail;
  }

  /** AC-69/70: copy the run's provider, model, prompt and strategy onto the agent (skills untouched). */
  async promote(workspaceId: string, runId: string): Promise<Agent> {
    const run = await this.repo.getRun(workspaceId, runId);
    if (!run) throw new NotFoundError('Run not found');
    if (run.status !== 'done') throw conflict('run_not_done', 'Only a finished run can be promoted.');
    const agent = await this.requireAgent(workspaceId, run.agentId);
    const cfg = (run.config as { provider: Agent['provider']; model: string; system_prompt: string; strategy: NonNullable<Agent['strategy']> });
    if (
      agent.provider === cfg.provider && agent.model === cfg.model &&
      agent.systemPrompt === cfg.system_prompt && (agent.strategy ?? 'single-pass') === cfg.strategy
    ) {
      throw conflict('already_current', 'The agent already uses this configuration.');
    }
    const updated = await new AgentsService(this.container).update(workspaceId, agent.id, {
      provider: cfg.provider, model: cfg.model, system_prompt: cfg.system_prompt, strategy: cfg.strategy,
    });
    if (!updated) throw new NotFoundError('Agent not found');
    return updated;
  }

  async dashboard(workspaceId: string): Promise<EvalDashboard> {
    const [agents, doneRuns, recent, runningIds] = await Promise.all([
      this.repo.agentsWithCaseCount(workspaceId),
      this.repo.recentDoneRunsPerAgent(workspaceId),
      this.repo.recentDoneRuns(workspaceId),
      this.repo.agentIdsRunning(workspaceId),
    ]);
    const running = new Set(runningIds);
    return {
      agents: agents.map((a) => {
        const runs = doneRuns.filter((r) => r.agentId === a.id); // newest first
        return {
          agent_id: a.id, name: a.name, model: a.model, enabled: a.enabled, case_count: a.caseCount,
          running: running.has(a.id),
          latest: runs[0] ? toRunRecordDto(runs[0]) : null,
          recall_trend: runs.map((r) => r.recall).filter((v): v is number => v !== null).reverse(),
        };
      }),
      recent_runs: recent.map((r) => ({ ...toRunRecordDto(r), agent_name: r.agentName })),
    };
  }
}
