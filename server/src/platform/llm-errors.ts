import { z } from 'zod';
import { ConfigError } from './errors.js';
import { TimeoutError } from './resilience.js';

export type LlmFailure = 'timeout' | 'rate_limited' | 'no_api_key' | 'invalid_output' | 'provider_error';

/** Maps a raw provider/SDK/schema error to a coarse reason (shared by onboarding and brief). */
export function classifyLlmError(err: unknown): LlmFailure {
  const e = err as { name?: unknown; status?: unknown; message?: unknown } | null;
  const name = typeof e?.name === 'string' ? e.name : '';
  const message = typeof e?.message === 'string' ? e.message : '';
  if (err instanceof TimeoutError || name.includes('Timeout')) return 'timeout';
  if (e?.status === 429) return 'rate_limited';
  if (err instanceof ConfigError && message.includes('API_KEY')) return 'no_api_key';
  if (err instanceof z.ZodError || name === 'ZodError' || err instanceof SyntaxError || /structured output failed schema validation|returned no choices|in JSON at position|not valid JSON|Unexpected token/i.test(message)) return 'invalid_output';
  return 'provider_error';
}
