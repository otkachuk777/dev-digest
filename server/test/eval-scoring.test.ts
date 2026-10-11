import { describe, it, expect } from 'vitest';
import { matches, scoreCase, scoreRun, type CaseScore } from '../src/modules/eval/scoring.js';

const range = (file: string, s: number, e = s) => ({ file, start_line: s, end_line: e });

describe('eval scoring', () => {
  it('AC-51: matches only on the exact file and a shared line (inclusive edges)', () => {
    const item = range('src/config.ts', 12);
    expect(matches(range('src/config.ts', 11, 13), item)).toBe(true);
    expect(matches(range('src/config.ts', 12, 12), item)).toBe(true);
    expect(matches(range('src/config.ts', 13, 20), item)).toBe(false);
    expect(matches(range('src/config.ts', 1, 11), item)).toBe(false);
    expect(matches(range('src/Config.ts', 12), item)).toBe(false);
    expect(matches(range('config.ts', 12), item)).toBe(false);
    // item range edges are inclusive too
    expect(matches(range('a.ts', 20, 25), range('a.ts', 10, 20))).toBe(true);
    expect(matches(range('a.ts', 21, 25), range('a.ts', 10, 20))).toBe(false);
  });

  it('AC-52: must_find passes only when every item is matched; one finding matching two items counts both once', () => {
    const items = [range('a.ts', 1, 10), range('a.ts', 5, 6)];
    const both = scoreCase('must_find', items, [range('a.ts', 5)], 0);
    expect(both).toMatchObject({ status: 'pass', expectedCount: 2, matchedCount: 2, tp: 1, fp: 0, kept: 1 });
    const one = scoreCase('must_find', [range('a.ts', 1), range('b.ts', 1)], [range('a.ts', 1), range('a.ts', 1)], 0);
    expect(one).toMatchObject({ status: 'fail', expectedCount: 2, matchedCount: 1, tp: 2 });
  });

  it('AC-53: must_not_flag passes when nothing matches; m counts matching findings', () => {
    const items = [range('src/app.ts', 40, 42)];
    expect(scoreCase('must_not_flag', items, [range('src/app.ts', 50)], 2)).toMatchObject({
      status: 'pass', expectedCount: 0, matchedCount: 0, tp: 0, fp: 0, kept: 1, dropped: 2,
    });
    expect(scoreCase('must_not_flag', items, [range('src/app.ts', 42, 45), range('src/app.ts', 41)], 0)).toMatchObject({
      status: 'fail', expectedCount: 0, matchedCount: 2, fp: 2,
    });
  });

  it('AC-54..58 / EC-14: worked example', () => {
    const a = scoreCase('must_find', [range('src/config.ts', 12)], [range('src/config.ts', 11, 13), range('src/config.ts', 30)], 1);
    const b = scoreCase('must_not_flag', [range('src/app.ts', 40, 42)], [range('src/app.ts', 42, 45)], 0);
    expect(a.status).toBe('pass');
    expect(b.status).toBe('fail');
    const run = scoreRun([
      { type: 'must_find', ...a, costUsd: 0.01 },
      { type: 'must_not_flag', ...b, costUsd: 0.02 },
    ]);
    expect(run).toMatchObject({ recall: 1, precision: 0.5, citationAccuracy: 0.75, passed: 1, total: 2, errored: 0 });
    expect(run.costUsd).toBeCloseTo(0.03);
  });

  it('EC-15 / AC-57: all must_not_flag with no kept findings gives null metrics', () => {
    const s = scoreCase('must_not_flag', [range('a.ts', 1)], [], 0);
    const run = scoreRun([{ type: 'must_not_flag', ...s, costUsd: 0 }]);
    expect(s.status).toBe('pass');
    expect(run).toMatchObject({ recall: null, precision: null, citationAccuracy: null, passed: 1, total: 1 });
  });

  it('EC-16 / AC-58: an errored case is left out of every metric', () => {
    const ok = (n: string): CaseScore => ({
      type: 'must_find', ...scoreCase('must_find', [range(n, 1)], [range(n, 1)], 0), costUsd: 0.1,
    });
    const err: CaseScore = {
      type: 'must_find', status: 'error', expectedCount: 5, matchedCount: 0, tp: 0, fp: 9, kept: 9, dropped: 9, costUsd: null,
    };
    const run = scoreRun([ok('a.ts'), err, ok('b.ts')]);
    expect(run).toMatchObject({ recall: 1, precision: 1, citationAccuracy: 1, passed: 2, total: 3, errored: 1 });
    expect(run.costUsd).toBeCloseTo(0.2);
  });

  it('AC-59: cost is null when a non-errored case has unknown cost', () => {
    const s = scoreCase('must_find', [range('a.ts', 1)], [range('a.ts', 1)], 0);
    expect(scoreRun([{ type: 'must_find', ...s, costUsd: null }]).costUsd).toBeNull();
    expect(scoreRun([]).costUsd).toBe(0);
  });
});
