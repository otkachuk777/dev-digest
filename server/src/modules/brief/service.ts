import { PrBrief, type BlastRadius, type BriefMissing } from '@devdigest/shared';
import { BriefModelOutput, buildBriefPrompt, parseHunks, type BriefFacts } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import { classifyLlmError } from '../../platform/llm-errors.js';
import { TimeoutError } from '../../platform/resilience.js';
import { toBlastRadius } from '../blast/index.js';
import { classifyFile, extractIntentLinks, latestPerAgent } from '../reviews/index.js';
import { resolveFeatureModel } from '../settings/index.js';
import { GENERATION_TIMEOUT_MS, MAX_OUTPUT_TOKENS } from './constants.js';
import { blastSnapshot, groundBrief, orderFiles, selectFindings, specDocPaths } from './helpers.js';
import { BriefRepository } from './repository.js';

/** Structural logger so the route can pass `req.log` (no Fastify import in the service). */
export interface Logger {
  info(obj: object, msg?: string): void;
}

export interface BriefServiceOpts {
  timeoutMs?: number;
}

/** Grace added to the SDK timeout so our own race always fires first. */
const SDK_GRACE_MS = 5_000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

const FAILURE_CODE = {
  timeout: 'model_timeout',
  invalid_output: 'invalid_model_output',
  rate_limited: 'rate_limited',
  no_api_key: 'provider_error',
  provider_error: 'provider_error',
} as const;
const FAILURE_MESSAGE: Record<string, string> = {
  model_timeout: 'The brief model did not answer in time',
  invalid_model_output: 'The brief model returned an unusable answer',
  rate_limited: 'The brief model is rate limited — try again shortly',
  provider_error: 'The brief model call failed',
};

interface Metrics {
  pr_id: string;
  repo: string | null;
  pr_number: number | null;
  provider: string | null;
  model: string | null;
  llm_calls: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number | null;
  duration_ms: number;
  status: 'ok' | 'rejected' | 'failed';
  reason: string | null;
  dropped_items: number;
  truncated: boolean;
}

/**
 * One instance per app (created at route registration): `lock` is the in-memory per-PR
 * "generating" guard. One generation = at most ONE un-retried provider request.
 */
export class BriefService {
  private repo: BriefRepository;
  private lock = new Set<string>();

  constructor(
    private container: Container,
    private opts: BriefServiceOpts = {},
  ) {
    this.repo = new BriefRepository(container.db);
  }

  /** Stored brief or null; never calls the model or GitHub (AC-12, AC-50). */
  async get(workspaceId: string, prId: string): Promise<PrBrief | null> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const row = await this.repo.getBrief(workspaceId, prId);
    const parsed = row ? PrBrief.safeParse(row.json) : null; // an old/corrupt shape reads as "no brief"
    return parsed?.success ? parsed.data : null;
  }

  /**
   * AC-53 for a 429: the rate-limit hook rejects before the handler, so the line is resolved here.
   * Never throws; repo / pr_number are null only when the PR is not in the workspace.
   */
  async logRateLimited(workspaceId: string, prId: string, log: Logger): Promise<void> {
    const m: Metrics = {
      pr_id: prId, repo: null, pr_number: null, provider: null, model: null,
      llm_calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: null, duration_ms: 0,
      status: 'rejected', reason: 'rate_limited', dropped_items: 0, truncated: false,
    };
    try {
      const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
      const repo = pull ? await this.container.reviewRepo.getRepo(pull.repoId) : null;
      m.repo = repo?.fullName ?? null;
      m.pr_number = pull?.number ?? null;
      const choice = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
      m.provider = choice.provider;
      m.model = choice.model;
    } catch {
      /* log what we have */
    }
    log.info(m, 'pr brief generation');
  }

  async generate(workspaceId: string, prId: string, log?: Logger): Promise<PrBrief> {
    const start = Date.now();
    const m: Metrics = {
      pr_id: prId, repo: null, pr_number: null, provider: null, model: null,
      llm_calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: null, duration_ms: 0,
      status: 'rejected', reason: null, dropped_items: 0, truncated: false,
    };
    try {
      return await this.run(workspaceId, prId, start, m);
    } catch (err) {
      if (!m.reason) {
        m.status = 'failed';
        m.reason = err instanceof AppError ? err.code : 'internal_error';
      }
      throw err;
    } finally {
      m.duration_ms = Date.now() - start;
      log?.info(m, 'pr brief generation'); // never the description, issue or prompt text (NFR-9)
    }
  }

  private async run(workspaceId: string, prId: string, start: number, m: Metrics): Promise<PrBrief> {
    const { container } = this;
    const rr = container.reviewRepo;
    const timeoutMs = this.opts.timeoutMs ?? GENERATION_TIMEOUT_MS;
    const reject = (reason: string, err: AppError) => {
      m.reason = reason;
      return err;
    };

    const pull = await rr.getPull(workspaceId, prId);
    if (!pull) throw reject('not_found', new NotFoundError('Pull request not found'));
    const repo = await rr.getRepo(pull.repoId);
    if (!repo) throw reject('not_found', new NotFoundError('Repository not found'));
    m.repo = repo.fullName;
    m.pr_number = pull.number;

    // Check and take the lock with no await in between (two same-tick POSTs → one 409).
    if (this.lock.has(prId)) {
      throw reject('brief_in_progress', new AppError('brief_in_progress', 'A brief is already being generated for this PR', 409));
    }
    this.lock.add(prId);
    try {
      const prFiles = await rr.getPrFiles(prId);
      if (prFiles.length === 0) throw reject('empty_diff', new AppError('empty_diff', 'This PR has no changed files', 409));

      const choice = await resolveFeatureModel(container, workspaceId, 'risk_brief');
      m.provider = choice.provider;
      m.model = choice.model;
      let llm;
      try {
        llm = await container.llmNoRetry(choice.provider, timeoutMs + SDK_GRACE_MS);
      } catch (err) {
        if (err instanceof ConfigError) {
          throw reject('no_api_key', new AppError('no_api_key', `No API key for ${choice.provider}`, 400, { provider: choice.provider }));
        }
        throw err;
      }

      // ---- facts (deterministic; no diff bodies) ----
      const missing: BriefMissing[] = [];
      const repoRef = { owner: repo.owner, name: repo.name };
      const paths = prFiles.map((f) => f.path);

      const intentRow = await rr.getIntent(prId);
      if (!intentRow) missing.push('intent');
      const intent = intentRow
        ? { summary: intentRow.summary, in_scope: intentRow.inScope, out_of_scope: intentRow.outOfScope }
        : null;

      let blast: BlastRadius | null = null;
      try {
        const res = await container.repoIntel.getBlastRadius(pull.repoId, paths);
        if (!res.degraded) blast = toBlastRadius(res);
      } catch {
        blast = null;
      }
      if (!blast) missing.push('blast');

      const description = pull.body?.trim() ? pull.body : null;
      if (!description) missing.push('description');

      let issue: BriefFacts['issue'] = null;
      const link = extractIntentLinks(pull.body, repoRef, pull.number).find((l) => l.kind === 'issue');
      if (link?.number !== undefined) {
        try {
          const meta = await (await container.github()).getIssue(repoRef, link.number);
          issue = { title: meta.title, body: meta.body ?? null };
        } catch {
          missing.push('issue');
        }
      }

      const findings = selectFindings(latestPerAgent(await this.repo.latestFindings(prId)));
      const files = orderFiles(
        prFiles.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          role: classifyFile(f.path),
          hunks: parseHunks(f.patch),
          symbols: blast?.changed_symbols.filter((s) => s.file === f.path).map((s) => s.name) ?? [],
          findings: findings
            .filter((x) => x.file === f.path)
            .map((x) => ({ severity: x.severity, title: x.title, line: x.startLine })),
        })),
      );
      const downstream = blast?.downstream ?? [];
      const facts: BriefFacts = {
        title: pull.title,
        description,
        intent,
        files,
        blast: blast
          ? {
              callers: downstream.flatMap((d) => d.callers),
              endpoints: [...new Set(downstream.flatMap((d) => d.endpoints_affected))],
              crons: [...new Set(downstream.flatMap((d) => d.crons_affected))],
            }
          : null,
        issue,
        specDocPaths: specDocPaths(paths),
      };

      const prompt = buildBriefPrompt(facts, container.tokenizer);
      m.truncated = prompt.truncated;

      // ---- the one model call ----
      m.llm_calls = 1;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let res;
      try {
        res = await Promise.race([
          llm.completeStructured({
            model: choice.model,
            schema: BriefModelOutput,
            schemaName: 'PrBrief',
            messages: prompt.messages,
            temperature: 0,
            maxTokens: MAX_OUTPUT_TOKENS,
            maxRetries: 0,
            timeoutMs,
          }),
          new Promise<never>((_, rej) => {
            timer = setTimeout(() => rej(new TimeoutError(timeoutMs)), timeoutMs);
          }),
        ]);
      } catch (err) {
        const code = FAILURE_CODE[classifyLlmError(err)];
        m.status = 'failed';
        m.reason = code;
        throw new AppError(code, FAILURE_MESSAGE[code]!, 502);
      } finally {
        clearTimeout(timer);
      }
      m.tokens_in = res.tokensIn;
      m.tokens_out = res.tokensOut;
      m.cost_usd = res.costUsd == null ? null : round6(res.costUsd);

      // ---- ground, snapshot, store ----
      const grounded = groundBrief(res.data, {
        prFiles: new Map(files.map((f) => [f.path, f.hunks])),
        blastCallers: callerLines(prompt.sent.blast?.callers ?? []),
      });
      m.dropped_items = grounded.dropped;
      if (!grounded.summary) {
        m.status = 'failed';
        m.reason = 'invalid_model_output';
        throw new AppError('invalid_model_output', FAILURE_MESSAGE.invalid_model_output!, 502);
      }
      const brief = PrBrief.parse({
        summary: grounded.summary,
        intent: prompt.sent.intent,
        blast: blast ? blastSnapshot(blast, prompt.sent) : null,
        risks: { risks: grounded.risks },
        review_focus: grounded.review_focus,
        head_sha: pull.headSha,
        generated_at: new Date().toISOString(),
        provider: choice.provider,
        model: choice.model,
        llm_calls: 1,
        tokens_in: res.tokensIn,
        tokens_out: res.tokensOut,
        cost_usd: m.cost_usd,
        duration_ms: Date.now() - start,
        missing,
        truncated: prompt.truncated,
        files_truncated: pull.filesCount > prFiles.length,
        dropped_items: grounded.dropped,
      });
      if (!(await this.repo.upsertBrief(prId, brief))) {
        throw reject('not_found', new NotFoundError('Pull request was removed'));
      }
      m.status = 'ok';
      return brief;
    } finally {
      this.lock.delete(prId);
    }
  }
}

function callerLines(callers: { file: string; line: number }[]): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const c of callers) {
    const set = out.get(c.file) ?? new Set<number>();
    set.add(c.line);
    out.set(c.file, set);
  }
  return out;
}
