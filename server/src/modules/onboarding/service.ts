import { existsSync, statSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  Onboarding,
  type OnboardingGenerateResult,
  type OnboardingSkeletonReason,
  type OnboardingState,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { TimeoutError } from '../../platform/resilience.js';
import { resolveFeatureModel } from '../settings/index.js';
import { GENERATION_TIMEOUT_MS, HISTORY_TIMEOUT_MS, MAX_OUTPUT_TOKENS } from './constants.js';
import { buildPrompt, classifyLlmError, groundOutput, TourLlmOutput } from './helpers.js';
import { buildSkeletonSections, tourNotes, tourStatus } from './model.js';
import { OnboardingRepository } from './repository.js';

/** Structural logger so the route can pass `req.log` (no Fastify import in the service). */
export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface OnboardingServiceOpts {
  timeoutMs?: number;
  historyTimeoutMs?: number;
}

/** Grace added to the SDK timeout so our own race always fires first. */
const SDK_GRACE_MS = 5_000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * One instance per app (created at route registration): `lock` is the in-memory
 * per-repo "generating" guard. One generation = one deadline and at most ONE provider request.
 */
export class OnboardingService {
  private repo: OnboardingRepository;
  private lock = new Set<string>();

  constructor(
    private container: Container,
    private log?: Logger,
    private opts: OnboardingServiceOpts = {},
  ) {
    this.repo = new OnboardingRepository(container.db);
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.repo.repoInWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  private cloneRoot(repo: { owner: string; name: string }) {
    return this.container.git.clonePathFor({ owner: repo.owner, name: repo.name });
  }

  async getState(workspaceId: string, repoId: string): Promise<OnboardingState> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const hasClone = await stat(this.cloneRoot(repo)).then((s) => s.isDirectory(), () => false);
    const [row, index, choice] = await Promise.all([
      this.repo.getTour(workspaceId, repoId),
      this.container.repoIntel.getIndexState(repoId),
      resolveFeatureModel(this.container, workspaceId, 'onboarding'),
    ]);
    const parsed = row ? Onboarding.safeParse(row.json) : null; // EC-3: old shapes read as "no tour"
    return {
      clone_status: hasClone ? 'ok' : 'no_clone',
      generating: this.lock.has(repoId),
      current_commit_sha: index.lastIndexedSha || null,
      model: { provider: choice.provider, model: choice.model },
      tour: parsed?.success ? parsed.data : null,
    };
  }

  async generate(workspaceId: string, repoId: string): Promise<OnboardingGenerateResult> {
    const start = Date.now();
    const m = {
      repo: null as string | null,
      repo_id: repoId,
      provider: null as string | null,
      model: null as string | null,
      llm_calls: 0,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: null as number | null,
      duration_ms: 0,
      status: 'rejected' as string,
      reason: null as string | null,
      dropped_items: 0,
    };
    try {
      return await this.run(workspaceId, repoId, start, m);
    } catch (err) {
      if (!m.reason) {
        m.status = 'failed';
        m.reason = err instanceof AppError ? err.code : 'internal_error';
      }
      throw err;
    } finally {
      m.duration_ms = Date.now() - start;
      this.log?.info(m, 'onboarding generation'); // never prompt, file content or keys (NFR-5)
    }
  }

  private async run(
    workspaceId: string,
    repoId: string,
    start: number,
    m: { repo: string | null; provider: string | null; model: string | null; llm_calls: number; tokens_in: number; tokens_out: number; cost_usd: number | null; status: string; reason: string | null; dropped_items: number },
  ): Promise<OnboardingGenerateResult> {
    const { container } = this;
    const timeoutMs = this.opts.timeoutMs ?? GENERATION_TIMEOUT_MS;
    const deadline = start + timeoutMs;
    const reject = (reason: string, err: AppError) => {
      m.reason = reason;
      return err;
    };

    const repo = await this.repo.repoInWorkspace(workspaceId, repoId);
    if (!repo) throw reject('not_found', new NotFoundError('Repository not found'));
    m.repo = repo.fullName;
    const root = this.cloneRoot(repo);
    if (!(await stat(root).then((s) => s.isDirectory(), () => false))) {
      throw reject('no_clone', new AppError('no_clone', 'Repository has no local clone', 409));
    }
    if (this.lock.has(repoId)) {
      throw reject('generation_in_progress', new AppError('generation_in_progress', 'A generation is already running', 409));
    }
    this.lock.add(repoId);
    try {
      const facts = await container.repoIntel.collectFacts(repoId);
      const hot = await container.repoIntel.getHotness(repoId, {
        timeoutMs: Math.max(1, Math.min(this.opts.historyTimeoutMs ?? HISTORY_TIMEOUT_MS, deadline - Date.now())),
      });
      const notes = tourNotes(facts, hot.available);
      const sections = buildSkeletonSections(facts, hot.byPath);
      const choice = await resolveFeatureModel(container, workspaceId, 'onboarding');
      m.provider = choice.provider;
      m.model = choice.model;
      const generatedAt = new Date();
      const base = {
        repo_full_name: repo.fullName,
        commit_sha: facts.commitSha,
        generated_at: generatedAt.toISOString(),
        notes,
        files_total: facts.filesTotal,
        files_indexed: facts.filesIndexed,
        provider: choice.provider,
        model: choice.model,
      };
      const persist = async (tour: Onboarding) => {
        if (!(await this.repo.upsertTour(repoId, tour, generatedAt))) {
          throw reject('not_found', new NotFoundError('Repository was removed'));
        }
      };

      let failure: OnboardingSkeletonReason | null = null;
      const remaining = deadline - Date.now();
      if (remaining <= 0) failure = 'timeout';
      else {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let res: { data: TourLlmOutput; tokensIn: number; tokensOut: number; costUsd?: number | null } | null = null;
        try {
          const system = await loadPromptTemplate('onboarding.system.md');
          const { messages } = buildPrompt(facts, sections, system, container.tokenizer);
          const llm = await container.llmNoRetry(choice.provider, remaining + SDK_GRACE_MS);
          m.llm_calls = 1;
          res = await Promise.race([
            llm.completeStructured({
              model: choice.model,
              schema: TourLlmOutput,
              schemaName: 'OnboardingTour',
              messages,
              temperature: 0,
              maxTokens: MAX_OUTPUT_TOKENS,
              maxRetries: 0,
              timeoutMs: remaining,
            }),
            new Promise<never>((_, rej) => {
              timer = setTimeout(() => rej(new TimeoutError(remaining)), remaining);
            }),
          ]);
        } catch (err) {
          failure = classifyLlmError(err); // only provider call + schema parse land here
        } finally {
          clearTimeout(timer);
        }
        if (res) {
          // grounding / persistence errors propagate (logged as `failed`), not LLM failures
          const scopeExists = (p: string) => {
            const f = join(root, p);
            if (existsSync(f)) return true;
            try {
              return statSync(dirname(f)).isDirectory();
            } catch {
              return false;
            }
          };
          const grounded = groundOutput(res.data, sections, facts, scopeExists);
          m.tokens_in = res.tokensIn;
          m.tokens_out = res.tokensOut;
          m.cost_usd = res.costUsd == null ? null : round6(res.costUsd);
          m.dropped_items = grounded.dropped;
          m.status = tourStatus(true, notes);
          const tour: Onboarding = {
            ...base,
            ...grounded.sections,
            status: m.status as Onboarding['status'],
            skeleton_reason: null,
            llm_calls: 1,
            tokens_in: res.tokensIn,
            tokens_out: res.tokensOut,
            cost_usd: m.cost_usd,
            duration_ms: Date.now() - start,
            dropped_items: grounded.dropped,
          };
          await persist(tour);
          return { tour, failed_attempt: null };
        }
      }

      m.status = 'skeleton';
      m.reason = failure;
      const skeleton: Onboarding = {
        ...base,
        ...sections,
        status: 'skeleton',
        skeleton_reason: failure,
        llm_calls: m.llm_calls,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: null,
        duration_ms: Date.now() - start,
        dropped_items: 0,
      };
      const stored = await this.repo.getTour(workspaceId, repoId);
      const prev = stored ? Onboarding.safeParse(stored.json) : null;
      if (prev?.success && prev.data.status !== 'skeleton') {
        return { tour: prev.data, failed_attempt: { reason: failure ?? 'provider_error', skeleton } }; // AC-44: keep the good tour
      }
      await persist(skeleton);
      return { tour: skeleton, failed_attempt: null };
    } finally {
      this.lock.delete(repoId);
    }
  }
}
