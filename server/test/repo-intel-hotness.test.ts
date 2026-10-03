import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { MockGitClient } from '../src/adapters/mocks.js';

/** SPEC-02 hotness (AC-27, AC-29, EC-12, EC-13). Uses `MockGitClient.commitPaths`. */

class SpyGit extends MockGitClient {
  seen: { branch: string; opts: { maxCommits: number; sinceDays: number; timeoutMs: number } }[] = [];
  override async recentCommitPaths(...args: unknown[]) {
    this.seen.push({ branch: args[1] as string, opts: args[2] as SpyGit['seen'][number]['opts'] });
    return super.recentCommitPaths();
  }
}

const INDEXED = ['src/a.ts', 'src/b.ts', 'src/c.ts'];

function build(git: MockGitClient, basics: unknown = { id: 'r1', owner: 'o', name: 'r', defaultBranch: 'main', clonePath: null }) {
  const container = { config: { repoIntelEnabled: true }, db: {} as never, git } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoBasics: async () => basics,
    getRankRows: async () => INDEXED.map((path) => ({ path, pagerank: 0.1, percentile: 50 })),
    getRankedPaths: async () => INDEXED.map((path) => ({ path, rank: 0.1 })),
    tryGetIndexState: async () => null,
  };
  return svc;
}

describe('getHotness (AC-27)', () => {
  it('hotness = commits touching the file / highest count; covers indexed paths only', async () => {
    const git = new MockGitClient({
      commitPaths: [
        ['src/a.ts', 'src/b.ts'],
        ['src/a.ts'],
        ['src/a.ts', 'src/unindexed.ts'],
        ['src/a.ts', 'src/b.ts'],
      ],
    });
    const h = await build(git).getHotness('r1');
    expect(h.available).toBe(true);
    expect(h.byPath['src/a.ts']).toBe(1);
    expect(h.byPath['src/b.ts']).toBe(0.5);
    expect(h.byPath['src/c.ts'] ?? 0).toBe(0);
    expect(Object.keys(h.byPath)).not.toContain('src/unindexed.ts');
    for (const v of Object.values(h.byPath)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('asks the git port for at most 200 commits within 90 days of the default branch, bounded by timeoutMs', async () => {
    const git = new SpyGit({ commitPaths: [['src/a.ts']] });
    await build(git).getHotness('r1');
    expect(git.seen).toHaveLength(1);
    expect(git.seen[0]!.branch).toBe('main');
    expect(git.seen[0]!.opts).toMatchObject({ maxCommits: 200, sinceDays: 90 });
    expect(git.seen[0]!.opts.timeoutMs).toBeGreaterThan(0);
    expect(git.seen[0]!.opts.timeoutMs).toBeLessThanOrEqual(15_000);
  });

  it('EC-12: readable history with no commits -> every hotness 0 and still available', async () => {
    const h = await build(new MockGitClient({ commitPaths: [] })).getHotness('r1');
    expect(h.available).toBe(true);
    expect(Object.values(h.byPath).every((v) => v === 0)).toBe(true);
  });

  it('EC-12: commits that touch no indexed file -> every hotness 0 and still available', async () => {
    const h = await build(new MockGitClient({ commitPaths: [['README.md'], ['docs/x.md']] })).getHotness('r1');
    expect(h.available).toBe(true);
    expect(Object.values(h.byPath).every((v) => v === 0)).toBe(true);
  });
});

describe('getHotness — unavailable history (AC-29, EC-13)', () => {
  it('a fetch/log failure -> available:false and all 0', async () => {
    const h = await build(new MockGitClient({ commitPaths: new Error('offline') })).getHotness('r1');
    expect(h.available).toBe(false);
    expect(Object.values(h.byPath).every((v) => v === 0)).toBe(true);
  });

  it('a history read slower than timeoutMs -> available:false, returned promptly', async () => {
    class Hang extends MockGitClient {
      override recentCommitPaths(): Promise<string[][]> {
        return new Promise(() => {});
      }
    }
    const t0 = Date.now();
    const h = await build(new Hang()).getHotness('r1', { timeoutMs: 50 });
    expect(h.available).toBe(false);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('no repo -> available:false', async () => {
    const h = await build(new MockGitClient({ commitPaths: [['src/a.ts']] }), null).getHotness('r1');
    expect(h.available).toBe(false);
  });
});
