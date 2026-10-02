import type { Tokenizer } from '../../adapters/tokenizer/index.js';

// ponytail: process-wide cache, bounded by the live walk; per-container if several workspaces share a process
const cache = new Map<string, number>();

export function docCacheKey(doc: { abs: string; size: number; mtimeMs: number }): string {
  return `${doc.abs}|${doc.mtimeMs}|${doc.size}`;
}

/** Token count of a doc, recomputed only when its path, mtime or size changes. */
export async function countDocTokens(
  tokenizer: Pick<Tokenizer, 'count'>,
  doc: { abs: string; size: number; mtimeMs: number },
  read: () => Promise<string>,
): Promise<number> {
  const key = docCacheKey(doc);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const n = tokenizer.count(await read());
  cache.set(key, n);
  return n;
}

/** Drop every cached entry under `rootPrefix` that the current walk no longer produced. */
export function pruneRepo(rootPrefix: string, liveKeys: Set<string>): void {
  for (const k of cache.keys()) if (k.startsWith(rootPrefix) && !liveKeys.has(k)) cache.delete(k);
}
