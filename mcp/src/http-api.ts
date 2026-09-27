import type {
  Agent,
  Repo,
  PrMeta,
  ActiveRun,
  RunSummary,
  ReviewRunResponse,
  ReviewRecord,
  ConventionScan,
  PrDetail,
  BlastRadius,
} from '@devdigest/shared';
import type { DevDigestApi } from './port.js';
import { DevDigestError } from './errors.js';

const TIMEOUT_MS = 15_000;

/**
 * INFRASTRUCTURE — the one place that speaks HTTP. Translates the server's
 * error envelope (`{error:{code,message,details}}`, `server/src/app.ts`) and
 * network/timeout failures into `DevDigestError`. No MCP SDK import here.
 */
export class HttpDevDigestApi implements DevDigestApi {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { ...init, signal: combined });
    } catch (err) {
      if (combined.aborted && !signal?.aborted) {
        throw new DevDigestError(
          'unreachable',
          `DevDigest API not reachable at ${this.baseUrl} — start it: cd server && pnpm dev`,
        );
      }
      throw new DevDigestError(
        'unreachable',
        `DevDigest API not reachable at ${this.baseUrl} — start it: cd server && pnpm dev (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
    }

    if (!res.ok) {
      throw await this.toError(res);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private async toError(res: Response): Promise<DevDigestError> {
    if (res.status === 429) {
      return new DevDigestError('rate_limited', 'rate limited (10 runs/min) — wait a minute');
    }
    let body: { error?: { code?: string; message?: string } } | undefined;
    try {
      body = (await res.json()) as typeof body;
    } catch {
      body = undefined;
    }
    const message = body?.error?.message ?? `${res.status} ${res.statusText}`;
    if (res.status === 404) return new DevDigestError('not_found', message);
    if (res.status === 422) return new DevDigestError('invalid', message);
    return new DevDigestError('server', message);
  }

  async listAgents(signal?: AbortSignal): Promise<Agent[]> {
    return this.request<Agent[]>('/agents', { method: 'GET' }, signal);
  }

  async listRepos(signal?: AbortSignal): Promise<Repo[]> {
    return this.request<Repo[]>('/repos', { method: 'GET' }, signal);
  }

  async listPulls(repoId: string, signal?: AbortSignal): Promise<PrMeta[]> {
    return this.request<PrMeta[]>(`/repos/${encodeURIComponent(repoId)}/pulls`, { method: 'GET' }, signal);
  }

  async activeRuns(prId: string, signal?: AbortSignal): Promise<ActiveRun[]> {
    return this.request<ActiveRun[]>(
      `/pulls/${encodeURIComponent(prId)}/runs/active`,
      { method: 'GET' },
      signal,
    );
  }

  async startReview(prId: string, agentId: string, signal?: AbortSignal): Promise<ReviewRunResponse> {
    return this.request<ReviewRunResponse>(
      `/pulls/${encodeURIComponent(prId)}/review`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId }),
      },
      signal,
    );
  }

  async runs(prId: string, signal?: AbortSignal): Promise<RunSummary[]> {
    return this.request<RunSummary[]>(`/pulls/${encodeURIComponent(prId)}/runs`, { method: 'GET' }, signal);
  }

  async reviews(prId: string, signal?: AbortSignal): Promise<ReviewRecord[]> {
    return this.request<ReviewRecord[]>(
      `/pulls/${encodeURIComponent(prId)}/reviews`,
      { method: 'GET' },
      signal,
    );
  }

  async conventions(repoId: string, signal?: AbortSignal): Promise<ConventionScan> {
    return this.request<ConventionScan>(
      `/repos/${encodeURIComponent(repoId)}/conventions`,
      { method: 'GET' },
      signal,
    );
  }

  async pullDetail(prId: string, signal?: AbortSignal): Promise<PrDetail> {
    return this.request<PrDetail>(`/pulls/${encodeURIComponent(prId)}`, { method: 'GET' }, signal);
  }

  async blast(prId: string, signal?: AbortSignal): Promise<BlastRadius> {
    return this.request<BlastRadius>(`/pulls/${encodeURIComponent(prId)}/blast`, { method: 'GET' }, signal);
  }
}
