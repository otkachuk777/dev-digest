import type { Agent, Repo, PrMeta, ActiveRun } from '@devdigest/shared';
import { DevDigestError, NotFound } from './errors.js';

/**
 * DOMAIN — pure. Resolves a flat, model-supplied identifier ("owner/name", a
 * PR number, an agent name) against a list already fetched by the adapter.
 * Every miss returns a `DevDigestError` whose message leads the model
 * forward — never throws.
 */

const isUuid = (s: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function findRepo(repos: Repo[], ref: string): Repo | DevDigestError {
  const match = isUuid(ref)
    ? repos.find((r) => r.id === ref)
    : repos.find((r) => r.full_name.toLowerCase() === ref.toLowerCase());
  if (match) return match;
  const known = repos.slice(0, 10).map((r) => r.full_name);
  const list = known.length > 0 ? known.join(', ') : '(none configured)';
  return NotFound(`Repo "${ref}" not found. Known repos: ${list}`);
}

export function findPr(pulls: PrMeta[], number: number, repo = 'this repo'): PrMeta | DevDigestError {
  const match = pulls.find((p) => p.number === number);
  if (match) return match;
  const known = pulls.slice(0, 10).map((p) => `#${p.number}`);
  const list = known.length > 0 ? known.join(', ') : '(none imported yet)';
  return NotFound(`PR #${number} not found in ${repo}. Known PRs: ${list}`);
}

export function findAgent(agents: Agent[], ref: string): Agent | DevDigestError {
  const match = isUuid(ref)
    ? agents.find((a) => a.id === ref)
    : agents.find((a) => a.name.toLowerCase() === ref.toLowerCase());
  if (match) return match;
  const known = agents.slice(0, 10).map((a) => a.name).join(', ');
  return NotFound(`Agent "${ref}" not found. Known agents: ${known || '(none)'} — or call list_agents`);
}

/** No active run is a normal state (the caller starts a new one), not an error. */
export function activeRunFor(active: ActiveRun[], agentId: string): ActiveRun | undefined {
  return active.find((r) => r.agent_id === agentId);
}
