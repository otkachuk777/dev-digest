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

/**
 * PORT — type-only. The only way `usecases.ts` reaches the DevDigest API.
 * `http-api.ts` is the sole implementation (fetch against the running
 * Fastify server); a `test/usecases.test.ts` FakeApi is the other.
 */
export interface DevDigestApi {
  listAgents(signal?: AbortSignal): Promise<Agent[]>;
  listRepos(signal?: AbortSignal): Promise<Repo[]>;
  listPulls(repoId: string, signal?: AbortSignal): Promise<PrMeta[]>;
  activeRuns(prId: string, signal?: AbortSignal): Promise<ActiveRun[]>;
  startReview(prId: string, agentId: string, signal?: AbortSignal): Promise<ReviewRunResponse>;
  runs(prId: string, signal?: AbortSignal): Promise<RunSummary[]>;
  reviews(prId: string, signal?: AbortSignal): Promise<ReviewRecord[]>;
  conventions(repoId: string, signal?: AbortSignal): Promise<ConventionScan>;
}
