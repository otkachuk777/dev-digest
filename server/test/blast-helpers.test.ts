import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { toBlastRadius, buildSummary, mergePriorPrs } from '../src/modules/blast/helpers.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

function baseResult(overrides: Partial<BlastResult> = {}): BlastResult {
  return {
    changedSymbols: [],
    callers: [],
    impactedEndpoints: [],
    degraded: false,
    ...overrides,
  };
}

describe('toBlastRadius', () => {
  it('groups flat callers by viaSymbol into two downstream entries, in first-seen order', () => {
    const result = baseResult({
      changedSymbols: [
        { file: 'a.ts', name: 'alpha', kind: 'function' },
        { file: 'a.ts', name: 'beta', kind: 'function' },
      ],
      callers: [
        { file: 'c1.ts', symbol: 'callerOne', viaSymbol: 'alpha', line: 10, rank: 5 },
        { file: 'c2.ts', symbol: 'callerTwo', viaSymbol: 'beta', line: 20, rank: 3 },
      ],
    });
    const blast = toBlastRadius(result);
    expect(blast.downstream.map((d) => d.symbol)).toEqual(['alpha', 'beta']);
    expect(blast.downstream[0]!.callers).toEqual([{ name: 'callerOne', file: 'c1.ts', line: 10 }]);
    expect(blast.downstream[1]!.callers).toEqual([{ name: 'callerTwo', file: 'c2.ts', line: 20 }]);
  });

  it('attributes endpoints/crons through factsByFile, deduped; no facts → []', () => {
    const result = baseResult({
      changedSymbols: [{ file: 'a.ts', name: 'alpha', kind: 'function' }],
      callers: [
        { file: 'c1.ts', symbol: 'x', viaSymbol: 'alpha', line: 1, rank: 5 },
        { file: 'c2.ts', symbol: 'y', viaSymbol: 'alpha', line: 2, rank: 4 },
        { file: 'c3.ts', symbol: 'z', viaSymbol: 'alpha', line: 3, rank: 1 },
      ],
      factsByFile: {
        c1: { endpoints: [], crons: [] },
        'c1.ts': { endpoints: ['GET /a'], crons: ['job-a'] },
        'c2.ts': { endpoints: ['GET /a'], crons: [] },
      },
    });
    const blast = toBlastRadius(result);
    expect(blast.downstream[0]!.endpoints_affected).toEqual(['GET /a']);
    expect(blast.downstream[0]!.crons_affected).toEqual(['job-a']);
  });

  it('a symbol whose callers have no facts entries gets []', () => {
    const result = baseResult({
      changedSymbols: [{ file: 'a.ts', name: 'alpha', kind: 'function' }],
      callers: [{ file: 'c1.ts', symbol: 'x', viaSymbol: 'alpha', line: 1, rank: 1 }],
      factsByFile: {},
    });
    const blast = toBlastRadius(result);
    expect(blast.downstream[0]!.endpoints_affected).toEqual([]);
    expect(blast.downstream[0]!.crons_affected).toEqual([]);
  });

  it('sorts downstream by max caller rank desc', () => {
    const result = baseResult({
      changedSymbols: [
        { file: 'a.ts', name: 'low', kind: 'function' },
        { file: 'a.ts', name: 'high', kind: 'function' },
      ],
      callers: [
        { file: 'c1.ts', symbol: 'x', viaSymbol: 'low', line: 1, rank: 2 },
        { file: 'c2.ts', symbol: 'y', viaSymbol: 'high', line: 2, rank: 99 },
      ],
    });
    const blast = toBlastRadius(result);
    expect(blast.downstream.map((d) => d.symbol)).toEqual(['high', 'low']);
  });

  it('drops a caller whose file equals the symbol decl file', () => {
    const result = baseResult({
      changedSymbols: [{ file: 'a.ts', name: 'alpha', kind: 'function' }],
      callers: [
        { file: 'a.ts', symbol: 'self', viaSymbol: 'alpha', line: 1, rank: 1 },
        { file: 'c1.ts', symbol: 'real', viaSymbol: 'alpha', line: 2, rank: 2 },
      ],
    });
    const blast = toBlastRadius(result);
    expect(blast.downstream[0]!.callers).toEqual([{ name: 'real', file: 'c1.ts', line: 2 }]);
  });

  it('no callers → downstream: [] and the summary mentions "no downstream"; parses as BlastRadius', () => {
    const result = baseResult({
      changedSymbols: [{ file: 'a.ts', name: 'alpha', kind: 'function' }],
      callers: [],
    });
    const blast = toBlastRadius(result);
    expect(blast.downstream).toEqual([]);
    expect(blast.summary).toContain('no downstream');
    expect(blast.degraded).toBe(false);
    expect(blast.reason).toBeUndefined();
    expect(() => BlastRadius.parse(blast)).not.toThrow();
  });

  it('degraded passthrough is kept; absent keys stay absent when not degraded', () => {
    const degradedResult = baseResult({ degraded: true, reason: 'no_data' });
    const degraded = toBlastRadius(degradedResult);
    expect(degraded.degraded).toBe(true);
    expect(degraded.reason).toBe('no_data');
    expect(() => BlastRadius.parse(degraded)).not.toThrow();

    const clean = toBlastRadius(baseResult({ degraded: false }));
    expect(clean.degraded).toBe(false);
    expect('reason' in clean).toBe(false);
  });
});

describe('buildSummary', () => {
  it('formats symbols/callers/endpoints/crons', () => {
    expect(buildSummary(2, 14, 3, 1)).toBe('2 symbols changed · 14 callers · 3 endpoints · 1 cron');
  });

  it('no callers reads "no downstream callers"', () => {
    expect(buildSummary(2, 0, 0, 0)).toBe('2 symbols changed · no downstream callers');
  });
});

describe('mergePriorPrs', () => {
  it('dedupes across files, collects files_overlap, excludes the current PR, sorts desc, caps', () => {
    const files = ['a.ts', 'b.ts', 'c.ts'];
    const perFile = [
      [
        { number: 10, title: 'PR10', author: 'x', merged_at: '2026-01-01T00:00:00Z' },
        { number: 20, title: 'PR20', author: 'y', merged_at: '2026-02-01T00:00:00Z' },
      ],
      [{ number: 10, title: 'PR10', author: 'x', merged_at: '2026-01-01T00:00:00Z' }],
      [
        { number: 30, title: 'current', author: 'z', merged_at: '2026-03-01T00:00:00Z' },
        { number: 40, title: 'PR40', author: 'w', merged_at: '2026-01-15T00:00:00Z' },
      ],
    ];
    const out = mergePriorPrs(files, perFile, 30, 2);
    expect(out).toHaveLength(2);
    expect(out[0]!.pr_number).toBe(20);
    expect(out[1]!.pr_number).toBe(40);
    const pr10 = null;
    void pr10;
    // PR 10 is overlapped by a.ts + b.ts (dropped by the cap, but check via max=3)
    const full = mergePriorPrs(files, perFile, 30, 3);
    const ten = full.find((p) => p.pr_number === 10)!;
    expect(ten.files_overlap.sort()).toEqual(['a.ts', 'b.ts']);
  });
});
