import { simpleGit, type SimpleGit } from 'simple-git';
import { join } from 'node:path';
import { mkdir, readFile, access, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import type {
  GitClient,
  RepoRef,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './diff-parser.js';

/**
 * Depth fetched by `sync()`. Deeper than the shallow clone (CLONE_DEPTH=1) so the
 * previously-indexed sha is usually reachable, keeping the resync diff incremental;
 * when it isn't, the indexer falls back to a full reindex.
 */
const RESYNC_FETCH_DEPTH = 50;

/** Tried after the stored default branch when it doesn't exist on origin. */
const FALLBACK_BRANCHES = ['main', 'master'];

/** Inherited vars simple-git refuses (GIT_EDITOR, PAGER…) — a network git call needs none. */
function isBlockedEnv(key: string): boolean {
  return key.startsWith('GIT_') || key === 'PAGER' || key === 'EDITOR' || key === 'VISUAL';
}

/** `https://user:token@host/x` → `https://host/x`; non-URL remotes are returned as-is. */
export function stripCredentials(url: string): string {
  try {
    const u = new URL(url);
    if (!u.username && !u.password) return url;
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 */
export class SimpleGitClient implements GitClient {
  /**
   * `getToken` (GitHub PAT) authenticates network calls via an http header
   * passed in GIT_CONFIG_* env vars — never written into the clone's
   * .git/config remote URL and never visible in the process argv.
   */
  constructor(
    private cloneDir: string,
    private getToken?: () => Promise<string | undefined>,
  ) {
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses) rather
    // than via simple-git's .env(), which inspects and rejects vars like
    // PAGER/EDITOR present in the shell environment.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  clonePathFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  private git(repo: RepoRef): SimpleGit {
    return simpleGit(this.clonePathFor(repo));
  }

  /** simple-git for a command that talks to github.com (clone/fetch/ls-remote). */
  private async remote(dir: string): Promise<SimpleGit> {
    const token = await this.getToken?.();
    if (!token) return simpleGit(dir);
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !isBlockedEnv(k)),
    );
    return simpleGit(dir, { unsafe: { allowUnsafeConfigEnvCount: true } }).env({
      ...env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    });
  }

  /** Clones made before auth moved to headers carry the PAT in `origin` — drop it. */
  private async scrubOrigin(dir: string): Promise<void> {
    const g = simpleGit(dir);
    const url = (await g.remote(['get-url', 'origin']))?.trim() ?? '';
    const clean = stripCredentials(url);
    if (clean !== url) await g.remote(['set-url', 'origin', clean]);
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async clone(
    repo: RepoRef,
    url: string,
    opts?: CloneOptions,
  ): Promise<{ path: string; branch?: string }> {
    const dest = this.clonePathFor(repo);
    await mkdir(join(this.cloneDir, repo.owner), { recursive: true });
    if (await this.exists(join(dest, '.git'))) {
      // already cloned → fetch latest
      await this.scrubOrigin(dest);
      await (await this.remote(dest)).fetch();
      return { path: dest, branch: await this.checkedOutBranch(dest) };
    }
    // A prior clone may have timed out mid-write, leaving a partial dir without
    // a .git — git clone refuses a non-empty dest, so clear it first.
    if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
    const args: string[] = [];
    if (opts?.depth) args.push('--depth', String(opts.depth));
    if (opts?.branch) args.push('--branch', opts.branch);
    await (await this.remote(this.cloneDir)).clone(stripCredentials(url), dest, args);
    return { path: dest, branch: await this.checkedOutBranch(dest) };
  }

  /** Branch a fresh clone checked out = the remote's default (`main`, `master`, …). */
  private async checkedOutBranch(dest: string): Promise<string | undefined> {
    const branch = (await simpleGit(dest).revparse(['--abbrev-ref', 'HEAD'])).trim();
    return branch && branch !== 'HEAD' ? branch : undefined; // 'HEAD' = detached
  }

  async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
    // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
    const dir = this.clonePathFor(repo);
    await this.scrubOrigin(dir);
    await (await this.remote(dir)).fetch(['origin', `pull/${n}/head:pr-${n}`]);
  }

  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    const dir = this.clonePathFor(repo);
    await this.scrubOrigin(dir);
    const net = await this.remote(dir);
    const target = await this.existingBranch(net, branch);
    await net.fetch(['origin', target, '--depth', String(RESYNC_FETCH_DEPTH)]);
    const g = this.git(repo);
    await g.reset(['--hard', `origin/${target}`]);
    return { head: (await g.revparse(['HEAD'])).trim() };
  }

  /**
   * First of `branch`, 'main', 'master' that exists on origin — a stored
   * default of 'main' must not break a 'master' repo (and vice versa).
   */
  private async existingBranch(net: SimpleGit, branch: string): Promise<string> {
    const candidates = [...new Set([branch, ...FALLBACK_BRANCHES])];
    const heads = await net.raw(['ls-remote', '--heads', 'origin', ...candidates]);
    const found = new Set(
      heads
        .split('\n')
        .map((l) => l.split('\t')[1]?.trim().replace('refs/heads/', ''))
        .filter(Boolean),
    );
    const hit = candidates.find((c) => found.has(c));
    if (!hit) throw new Error(`none of ${candidates.join(', ')} exists on origin`);
    return hit;
  }

  async currentHead(repo: RepoRef): Promise<string> {
    return (await this.git(repo).revparse(['HEAD'])).trim();
  }

  async diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff> {
    const raw = await this.git(repo).diff([`${base}...${head}`]);
    return parseUnifiedDiff(raw);
  }

  /**
   * `git diff --name-only base..head` — used by the incremental indexer to
   * pick the file set that changed since `last_indexed_sha`. Two-dot is
   * intentional (commits reachable from `head` but not `base`), unlike the
   * three-dot symmetric form `diff()` uses for review diffs.
   */
  async diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]> {
    if (base === head) return [];
    const raw = await this.git(repo).raw(['diff', '--name-only', `${base}..${head}`]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async blame(repo: RepoRef, path: string): Promise<BlameLine[]> {
    const raw = await this.git(repo).raw(['blame', '--line-porcelain', path]);
    return parseBlamePorcelain(raw);
  }

  async log(repo: RepoRef, path?: string): Promise<GitCommit[]> {
    const log = await this.git(repo).log(path ? { file: path } : undefined);
    return log.all.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }

  async readFile(repo: RepoRef, path: string): Promise<string> {
    return readFile(join(this.clonePathFor(repo), path), 'utf8');
  }
}

function parseBlamePorcelain(raw: string): BlameLine[] {
  const out: BlameLine[] = [];
  const lines = raw.split('\n');
  let sha = '';
  let author = '';
  let date = '';
  let summary = '';
  let lineNo = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (header) {
      sha = header[1]!;
      lineNo = Number(header[2]);
    } else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('author-time '))
      date = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t')) {
      out.push({ line: lineNo, sha, author, date, summary });
    }
  }
  return out;
}
