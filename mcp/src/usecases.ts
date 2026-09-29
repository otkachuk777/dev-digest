import { setTimeout as sleep } from 'node:timers/promises';
import type { RunSummary, Verdict, BlastRadius } from '@devdigest/shared';
import { DevDigestError } from './errors.js';
import { activeRunFor, findAgent, findPr, findRepo } from './match.js';
import { capOutput, shapeAgents, shapeConventions, shapePrFindings, shapeReview } from './shape.js';
import type { ShapedAgent, ShapedConventions, ShapedFinding, ShapedPrFindings } from './shape.js';
import type { DevDigestApi } from './port.js';
import type {
  GetBlastRadiusInput,
  GetConventionsInput,
  GetFindingsInput,
  GetPrFindingsInput,
  RunAgentOnPrInput,
} from './inputs.js';

/**
 * APPLICATION — orchestrates the port + domain rules into the outcome each
 * tool needs (principle 1: outcome, not operation). Never imports
 * `http-api.ts` or the MCP SDK — only the port interface and pure domain.
 */

function unwrap<T>(value: T | DevDigestError): T {
  if (value instanceof DevDigestError) throw value;
  return value;
}

const RETRY_HINT = 'Retry run_agent_on_pr or pick another agent (list_agents).';
const STILL_RUNNING_HINT = (repo: string, pr: number, runId: string) =>
  `Still running — call get_findings(${JSON.stringify(repo)}, ${pr}, ${JSON.stringify(runId)}) in ~1 min.`;

export interface WaitOpts {
  pollMs?: number;
  waitMs?: number;
  /** How long a reasonless `failed` may persist before we believe it. */
  failGraceMs?: number;
  signal?: AbortSignal;
}

/** A real failure always records `error`; `failed` with no error is what the
 *  server's boot-time reaper writes, and the live runner may still overwrite
 *  it with `done` — so it is not trusted until it outlasts a grace window. */
const isReasonlessFailure = (run?: RunSummary): boolean =>
  run?.status === 'failed' && !run.error;

/** Past this age a reasonless `failed` cannot be overwritten any more — the
 *  run is really dead (reviews finish in minutes; the slowest seen ~4.5 min). */
const DEAD_RUN_AFTER_MS = 15 * 60_000;
const mayStillFinish = (run: RunSummary): boolean =>
  isReasonlessFailure(run) && (!run.ran_at || Date.now() - Date.parse(run.ran_at) < DEAD_RUN_AFTER_MS);

export interface WaitResult {
  status: 'done' | 'failed' | 'cancelled' | 'running';
  run?: RunSummary;
}

/** Polls `GET /pulls/:id/runs` every `pollMs` up to a hard `waitMs` cap, and
 *  stops early (still returning `running`) if `signal` aborts. Never cancels
 *  the server-side run — a timeout or client abort just stops watching it. */
export async function waitForRun(
  api: DevDigestApi,
  prId: string,
  runId: string,
  opts: WaitOpts = {},
): Promise<WaitResult> {
  const pollMs = opts.pollMs ?? 3000;
  const waitMs = opts.waitMs ?? 120_000;
  const signal = opts.signal;
  const failGraceMs = opts.failGraceMs ?? 30_000;
  const deadline = Date.now() + waitMs;
  let suspectSince: number | undefined;

  for (;;) {
    const runs = await api.runs(prId, signal);
    const run = runs.find((r) => r.run_id === runId);
    const status = run?.status;
    if (isReasonlessFailure(run)) {
      suspectSince ??= Date.now();
      if (Date.now() - suspectSince >= failGraceMs) return { status: 'failed', run };
    } else if (status && status !== 'running') {
      return { status: status as 'done' | 'failed' | 'cancelled', run };
    } else {
      suspectSince = undefined;
    }
    if (Date.now() >= deadline || signal?.aborted) {
      return { status: 'running', run };
    }
    const remaining = deadline - Date.now();
    try {
      await sleep(Math.min(pollMs, remaining), undefined, { signal });
    } catch {
      // aborted mid-sleep — loop will exit via the signal.aborted check above
    }
  }
}

export interface ShapedReviewResult {
  status: 'done';
  run_id: string;
  agent: string | null;
  verdict: Verdict | null;
  score: number | null;
  summary: string | null;
  findings: ShapedFinding[];
  total: number;
  truncated: boolean;
}

export interface RunningResult {
  status: 'running';
  run_id: string;
  hint: string;
}

export type ReviewToolResult = ShapedReviewResult | RunningResult;

export async function listAgents(
  api: DevDigestApi,
  signal?: AbortSignal,
): Promise<{ agents: ShapedAgent[] }> {
  const agents = shapeAgents(await api.listAgents(signal));
  if (agents.length === 0) {
    throw new DevDigestError(
      'not_found',
      'No agents configured — create one in the DevDigest UI (Agents page).',
    );
  }
  return { agents };
}

export async function runAgentOnPr(
  api: DevDigestApi,
  input: RunAgentOnPrInput,
  opts: WaitOpts & { limit?: number } = {},
): Promise<ReviewToolResult> {
  const { signal } = opts;
  const repoObj = unwrap(findRepo(await api.listRepos(signal), input.repo));
  const prObj = unwrap(findPr(await api.listPulls(repoObj.id, signal), input.pr, repoObj.full_name));
  if (!prObj.id) throw new DevDigestError('server', `PR #${input.pr} has no id — check the server log`);
  const agentObj = unwrap(findAgent(await api.listAgents(signal), input.agent));

  const existing = activeRunFor(await api.activeRuns(prObj.id, signal), agentObj.id);
  let runId: string;
  if (existing) {
    runId = existing.run_id;
  } else {
    const started = await api.startReview(prObj.id, agentObj.id, signal);
    const target = started.runs.find((r) => r.agent_id === agentObj.id) ?? started.runs[0];
    if (!target) {
      throw new DevDigestError('server', 'The review did not start a run — check the server log');
    }
    runId = target.run_id;
  }

  const waited = await waitForRun(api, prObj.id, runId, opts);
  if (waited.status === 'running') {
    return { status: 'running', run_id: runId, hint: STILL_RUNNING_HINT(input.repo, input.pr, runId) };
  }
  if (waited.status === 'failed' || waited.status === 'cancelled') {
    throw new DevDigestError(
      'server',
      `Run ${runId} failed: ${waited.run?.error ?? 'no reason recorded (server may have restarted)'}. ${RETRY_HINT}`,
    );
  }

  const reviews = await api.reviews(prObj.id, signal);
  const record = reviews.find((r) => r.run_id === runId);
  if (!record) {
    throw new DevDigestError(
      'server',
      `Run ${runId} completed but no review was found — check the server log`,
    );
  }
  return capOutput({
    status: 'done' as const,
    run_id: runId,
    agent: record.agent_name ?? agentObj.name,
    ...shapeReview(record, opts.limit ?? 20),
  });
}

export async function getFindings(
  api: DevDigestApi,
  input: GetFindingsInput,
  signal?: AbortSignal,
): Promise<ReviewToolResult> {
  const repoObj = unwrap(findRepo(await api.listRepos(signal), input.repo));
  const prObj = unwrap(findPr(await api.listPulls(repoObj.id, signal), input.pr, repoObj.full_name));
  if (!prObj.id) throw new DevDigestError('server', `PR #${input.pr} has no id — check the server log`);

  const reviews = await api.reviews(prObj.id, signal);

  if (input.run_id) {
    const record = reviews.find((r) => r.run_id === input.run_id);
    if (record) {
      return capOutput({
        status: 'done' as const,
        run_id: input.run_id,
        agent: record.agent_name ?? null,
        ...shapeReview(record, input.limit ?? 20),
      });
    }
    const run = (await api.runs(prObj.id, signal)).find((r) => r.run_id === input.run_id);
    if (!run) {
      throw new DevDigestError('not_found', 'run not found on this PR — call run_agent_on_pr first');
    }
    if (run.status === 'running' || mayStillFinish(run)) {
      return {
        status: 'running',
        run_id: input.run_id,
        hint: STILL_RUNNING_HINT(input.repo, input.pr, input.run_id),
      };
    }
    throw new DevDigestError('server', `Run ${input.run_id} failed: ${run.error ?? 'no reason recorded (server may have restarted)'}. ${RETRY_HINT}`);
  }

  const newest = reviews[0];
  if (!newest) {
    throw new DevDigestError('not_found', 'No reviews yet for this PR — call run_agent_on_pr first');
  }
  return capOutput({
    status: 'done' as const,
    run_id: newest.run_id ?? '',
    agent: newest.agent_name ?? null,
    ...shapeReview(newest, input.limit ?? 20),
  });
}

export async function getPrFindings(
  api: DevDigestApi,
  input: GetPrFindingsInput,
  signal?: AbortSignal,
): Promise<ShapedPrFindings> {
  const repoObj = unwrap(findRepo(await api.listRepos(signal), input.repo));
  const prObj = unwrap(findPr(await api.listPulls(repoObj.id, signal), input.pr, repoObj.full_name));
  if (!prObj.id) throw new DevDigestError('server', `PR #${input.pr} has no id — check the server log`);

  const shaped = shapePrFindings(await api.reviews(prObj.id, signal), input.limit_per_agent ?? 10);
  if (shaped.reviews.length === 0) {
    throw new DevDigestError('not_found', 'No reviews yet for this PR — call run_agent_on_pr first');
  }
  // capOutput only trims a top-level `findings`, so cap each review with an equal share.
  const share = Math.floor(20_000 / shaped.reviews.length);
  return { ...shaped, reviews: shaped.reviews.map((r) => capOutput(r, share)) };
}

export async function getConventions(
  api: DevDigestApi,
  input: GetConventionsInput,
  signal?: AbortSignal,
): Promise<ShapedConventions> {
  const repoObj = unwrap(findRepo(await api.listRepos(signal), input.repo));
  const shaped = shapeConventions(await api.conventions(repoObj.id, signal), input.limit ?? 30);
  if (shaped.total === 0) {
    throw new DevDigestError(
      'not_found',
      `No accepted conventions for ${repoObj.full_name} — run the scan / accept rules on the repo's Conventions page in DevDigest.`,
    );
  }
  return shaped;
}

/**
 * PR impact map: what else a PR's diff can affect (callers, HTTP endpoints,
 * crons), read from the prebuilt repo-intel index. `pullDetail` runs first so
 * a PR never opened in the UI still has `pr_files` persisted; `blast` is then
 * returned as-is, so this is the SAME map the Overview tab shows.
 */
export async function getBlastRadius(
  api: DevDigestApi,
  input: GetBlastRadiusInput,
  signal?: AbortSignal,
): Promise<BlastRadius> {
  const repoObj = unwrap(findRepo(await api.listRepos(signal), input.repo));
  const prObj = unwrap(findPr(await api.listPulls(repoObj.id, signal), input.pr, repoObj.full_name));
  if (!prObj.id) throw new DevDigestError('server', `PR #${input.pr} has no id — check the server log`);

  await api.pullDetail(prObj.id, signal);
  return api.blast(prObj.id, signal);
}
