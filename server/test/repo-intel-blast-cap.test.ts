import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { FullSymbolRow, ResolvedCallerRow } from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * Step 2 — the per-symbol caller cap (`MAX_CALLERS_PER_SYMBOL`) must apply
 * PER `viaSymbol`, not to the whole caller list: the old code did
 * `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` on the combined, rank-sorted
 * list, so a high-rank symbol's callers could crowd out a low-rank symbol's
 * callers entirely. Also pins that a decl file is never its own caller.
 */

function declRow(path: string, name: string): FullSymbolRow {
  return { path, name, kind: 'function', line: 1, endLine: 2, exported: true, signature: null };
}

function buildService(opts: {
  status: IndexState['status'];
  alphaCallers: number;
  betaCallers: number;
  selfRow?: boolean;
}): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: true },
    db: {} as never,
  } as never;
  const svc = new RepoIntelService(container);

  const alphaRows: ResolvedCallerRow[] = Array.from({ length: opts.alphaCallers }, (_, i) => ({
    fromPath: `c${i}.ts`,
    toSymbol: 'alpha',
    line: 1,
    rank: 100 - i,
  }));
  const betaRows: ResolvedCallerRow[] = Array.from({ length: opts.betaCallers }, (_, i) => ({
    fromPath: `b${i}.ts`,
    toSymbol: 'beta',
    line: 1,
    rank: 1,
  }));

  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async (): Promise<IndexState> => ({
      repoId: 'r1',
      status: opts.status,
      filesIndexed: 1,
      filesSkipped: 0,
      durationMs: 0,
      lastIndexedSha: 'sha',
      indexerVersion: 2,
      updatedAt: new Date(),
    } as IndexState),
    getSymbolRows: async (_repoId: string, paths: string[]) => {
      if (paths.length === 1 && paths[0] === 'a.ts') {
        return [declRow('a.ts', 'alpha'), declRow('a.ts', 'beta')];
      }
      return [];
    },
    getResolvedCallers: async () => [
      ...alphaRows,
      ...betaRows,
      ...(opts.selfRow ? [{ fromPath: 'a.ts', toSymbol: 'alpha', line: 5, rank: 999 }] : []),
    ],
    getFileFacts: async () => [],
  };
  return svc;
}

describe('RepoIntel facade — per-symbol caller cap', () => {
  it('caps callers PER viaSymbol, not across the combined list', async () => {
    const svc = buildService({ status: 'full', alphaCallers: 25, betaCallers: 3 });
    const result = await svc.getBlastRadius('r1', ['a.ts']);

    const alphaCallers = result.callers.filter((c) => c.viaSymbol === 'alpha');
    const betaCallers = result.callers.filter((c) => c.viaSymbol === 'beta');

    expect(alphaCallers).toHaveLength(20);
    // The old `.slice(0, 20)` on the combined rank-sorted list drops beta
    // entirely (its rank=1 rows sort after all 25 alpha rows).
    expect(betaCallers).toHaveLength(3);
    expect(result.degraded).toBe(false);
  });

  it('a partial index reports degraded: true, reason: index_partial', async () => {
    const svc = buildService({ status: 'partial', alphaCallers: 5, betaCallers: 1 });
    const result = await svc.getBlastRadius('r1', ['a.ts']);
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('index_partial');
  });

  it("never returns a reference from the symbol's own decl file as a caller", async () => {
    const svc = buildService({ status: 'full', alphaCallers: 2, betaCallers: 1, selfRow: true });
    const result = await svc.getBlastRadius('r1', ['a.ts']);
    expect(result.callers.some((c) => c.file === 'a.ts')).toBe(false);
    expect(result.callers).toHaveLength(3);
  });
});
