import { describe, expect, it } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff, latestPerAgent } from '../src/modules/reviews/smart-diff/build.js';

describe('buildSmartDiff', () => {
  it('emits groups in ROLE_ORDER regardless of input order', () => {
    const files = [
      { path: 'README.md', additions: 1, deletions: 0 },
      { path: 'pnpm-lock.yaml', additions: 2, deletions: 0 },
      { path: 'src/service.ts', additions: 3, deletions: 0 },
      { path: 'src/index.ts', additions: 1, deletions: 0 },
      { path: 'test/foo.test.ts', additions: 1, deletions: 0 },
    ];
    const out = buildSmartDiff(files, []);
    expect(out.groups.map((g) => g.role)).toEqual([
      'core',
      'tests',
      'wiring',
      'docs',
      'boilerplate',
    ]);
  });

  it('omits empty roles', () => {
    const files = [{ path: 'src/service.ts', additions: 1, deletions: 0 }];
    const out = buildSmartDiff(files, []);
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0]!.role).toBe('core');
  });

  it('dedupes and sorts finding lines, attaching only to their own file', () => {
    const files = [
      { path: 'src/a.ts', additions: 1, deletions: 0 },
      { path: 'src/b.ts', additions: 1, deletions: 0 },
    ];
    const findings = [
      { file: 'src/a.ts', startLine: 10 },
      { file: 'src/a.ts', startLine: 5 },
      { file: 'src/a.ts', startLine: 10 },
      { file: 'src/b.ts', startLine: 99 },
    ];
    const out = buildSmartDiff(files, findings);
    const [group] = out.groups;
    const a = group!.files.find((f) => f.path === 'src/a.ts')!;
    const b = group!.files.find((f) => f.path === 'src/b.ts')!;
    expect(a.finding_lines).toEqual([5, 10]);
    expect(b.finding_lines).toEqual([99]);
  });

  it('computes total_lines as sum of additions + deletions', () => {
    const files = [
      { path: 'src/a.ts', additions: 3, deletions: 2 },
      { path: 'src/b.ts', additions: 1, deletions: 0 },
    ];
    const out = buildSmartDiff(files, []);
    expect(out.split_suggestion.total_lines).toBe(6);
  });

  it('produces output that satisfies SmartDiff.parse', () => {
    const files = [{ path: 'src/a.ts', additions: 1, deletions: 0 }];
    const out = buildSmartDiff(files, [{ file: 'src/a.ts', startLine: 1 }]);
    expect(() => SmartDiff.parse(out)).not.toThrow();
  });
});

describe('latestPerAgent', () => {
  it('drops an older review when an agent re-runs', () => {
    const rows = [
      { agentId: 'a1', reviewId: 'r2', file: 'x.ts', startLine: 1 },
      { agentId: 'a1', reviewId: 'r1', file: 'x.ts', startLine: 2 },
    ];
    const out = latestPerAgent(rows);
    expect(out).toEqual([{ agentId: 'a1', reviewId: 'r2', file: 'x.ts', startLine: 1 }]);
  });

  it('keeps rows from two different agents', () => {
    const rows = [
      { agentId: 'a1', reviewId: 'r1', file: 'x.ts', startLine: 1 },
      { agentId: 'a2', reviewId: 'r2', file: 'y.ts', startLine: 2 },
    ];
    const out = latestPerAgent(rows);
    expect(out).toHaveLength(2);
  });

  it('groups null-agentId rows per review — each review is its own group', () => {
    const rows = [
      { agentId: null, reviewId: 'r2', file: 'x.ts', startLine: 1 },
      { agentId: null, reviewId: 'r1', file: 'x.ts', startLine: 2 },
    ];
    const out = latestPerAgent(rows);
    expect(out).toEqual(rows);
  });

  it('drops a stale row from within the same null-agentId review', () => {
    const rows = [
      { agentId: null, reviewId: 'r1', file: 'x.ts', startLine: 1 },
      { agentId: null, reviewId: 'r1', file: 'y.ts', startLine: 2 },
    ];
    const out = latestPerAgent(rows);
    expect(out).toEqual(rows);
  });
});
