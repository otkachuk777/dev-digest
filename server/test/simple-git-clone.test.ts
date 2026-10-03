import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { SimpleGitClient, stripCredentials } from '../src/adapters/git/simple-git.js';

/**
 * Real git against a local `file://` origin:
 *  - `clone` reports the remote's default branch (excalidraw: 'master'),
 *  - `sync` falls back main ↔ master when the stored default doesn't exist,
 *  - the PAT never lands in .git/config (and an old token URL is scrubbed).
 */
describe('SimpleGitClient', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  async function makeOrigin(branch: string): Promise<{ origin: string; cloneDir: string }> {
    const origin = await mkdtemp(join(tmpdir(), 'git-origin-'));
    const cloneDir = await mkdtemp(join(tmpdir(), 'git-clones-'));
    dirs.push(origin, cloneDir);
    const g = simpleGit(origin);
    await g.init([`--initial-branch=${branch}`]);
    await commit(origin, 'init');
    return { origin, cloneDir };
  }

  async function commit(dir: string, msg: string): Promise<string> {
    const g = simpleGit(dir);
    await g.raw(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', msg]);
    return (await g.revparse(['HEAD'])).trim();
  }

  const repo = { owner: 'acme', name: 'app' };

  it("clone returns the remote's default branch, on first clone and on re-clone", async () => {
    const { origin, cloneDir } = await makeOrigin('trunk');
    const client = new SimpleGitClient(cloneDir);

    expect((await client.clone(repo, `file://${origin}`, { depth: 1 })).branch).toBe('trunk');
    expect((await client.clone(repo, `file://${origin}`)).branch).toBe('trunk');
  });

  it("sync with a stored 'main' advances a 'master' repo instead of failing", async () => {
    const { origin, cloneDir } = await makeOrigin('master');
    const client = new SimpleGitClient(cloneDir);
    await client.clone(repo, `file://${origin}`);
    const newHead = await commit(origin, 'next');

    expect((await client.sync(repo, 'main')).head).toBe(newHead);
  });

  it('sync fails clearly when neither the stored branch nor main/master exists', async () => {
    const { origin, cloneDir } = await makeOrigin('trunk');
    const client = new SimpleGitClient(cloneDir);
    await client.clone(repo, `file://${origin}`);

    await expect(client.sync(repo, 'develop')).rejects.toThrow(
      'none of develop, main, master exists on origin',
    );
  });

  it('with a token: works, keeps the token out of .git/config, scrubs an old token URL', async () => {
    const { origin, cloneDir } = await makeOrigin('main');
    const client = new SimpleGitClient(cloneDir, async () => 'ghp_secret');
    const { path } = await client.clone(repo, `file://${origin}`);
    const config = () => readFile(join(path, '.git', 'config'), 'utf8');
    expect(await config()).not.toContain('ghp_secret');

    // A clone made by the old code: PAT embedded in the origin URL.
    await simpleGit(path).remote(['set-url', 'origin', 'https://x-access-token:ghp_old@localhost:1/acme/app']);
    await client.fetchPullHead(repo, 1).catch(() => {}); // fetch fails (nothing listens); scrub runs first
    expect(await config()).not.toContain('ghp_old');
    expect(await config()).toContain('url = https://localhost:1/acme/app');
  });

  it('stripCredentials drops user:token and leaves other remotes alone', () => {
    expect(stripCredentials('https://x-access-token:t@github.com/a/b.git')).toBe('https://github.com/a/b.git');
    expect(stripCredentials('https://github.com/a/b.git')).toBe('https://github.com/a/b.git');
    expect(stripCredentials('git@github.com:a/b.git')).toBe('git@github.com:a/b.git');
  });
});
