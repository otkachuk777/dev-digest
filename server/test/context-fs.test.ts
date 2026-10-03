import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkDocs, readDocSafely } from '../src/modules/context/docs-fs.js';
import { countDocTokens, pruneRepo } from '../src/modules/context/token-cache.js';
import { MAX_FILE_SIZE } from '../src/modules/repo-intel/index.js';

const ROOTS = ['specs', 'docs', 'insights'] as const;

async function put(root: string, rel: string, body = '# x'): Promise<void> {
  const full = join(root, rel);
  await mkdir(full.slice(0, full.lastIndexOf('/')), { recursive: true });
  await writeFile(full, body);
}

describe('context docs fs', () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ctx-root-'));
    outside = await mkdtemp(join(tmpdir(), 'ctx-out-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('lists .devdigest/specs/a.md and sorts by path (AC-1)', async () => {
    await put(root, '.devdigest/specs/a.md');
    await put(root, 'docs/b.md');
    await put(root, 'src/c.md'); // outside roots
    await put(root, 'docs/d.txt');
    const docs = await walkDocs(root, [...ROOTS]);
    expect(docs.map((d) => d.path)).toEqual(['.devdigest/specs/a.md', 'docs/b.md']);
    expect(docs[0]).toMatchObject({ abs: join(root, '.devdigest/specs/a.md'), size: 3 });
    expect(typeof docs[0]?.mtimeMs).toBe('number');
  });

  it('prunes .git and EXCLUDED_DIRS', async () => {
    await put(root, 'node_modules/x/docs/a.md');
    await put(root, '.git/docs/a.md');
    await put(root, 'docs/ok.md');
    expect((await walkDocs(root, [...ROOTS])).map((d) => d.path)).toEqual(['docs/ok.md']);
  });

  it('skips files over MAX_FILE_SIZE', async () => {
    await put(root, 'docs/big.md', 'a'.repeat(MAX_FILE_SIZE + 1));
    await put(root, 'docs/small.md');
    expect((await walkDocs(root, [...ROOTS])).map((d) => d.path)).toEqual(['docs/small.md']);
  });

  it('skips symlinked files and dirs (AC-2)', async () => {
    await put(outside, 'secret.md', 'secret');
    await put(outside, 'docs/d.md', 'secret');
    await mkdir(join(root, 'docs'), { recursive: true });
    await symlink(join(outside, 'secret.md'), join(root, 'docs/link.md'));
    await symlink(join(outside, 'docs'), join(root, 'specs'));
    await put(root, 'docs/real.md');
    expect((await walkDocs(root, [...ROOTS])).map((d) => d.path)).toEqual(['docs/real.md']);
  });

  it('returns [] for a missing root', async () => {
    expect(await walkDocs(join(root, 'nope'), [...ROOTS])).toEqual([]);
  });

  it('readDocSafely reads a normal doc', async () => {
    await put(root, 'docs/a.md', 'hello');
    expect(await readDocSafely(root, 'docs/a.md')).toBe('hello');
  });

  it('readDocSafely refuses a symlinked file and a symlinked component (AC-13)', async () => {
    await put(outside, 'secret.md', 'secret');
    await put(outside, 'docs/d.md', 'secret');
    await mkdir(join(root, 'docs'), { recursive: true });
    await symlink(join(outside, 'secret.md'), join(root, 'docs/link.md'));
    await symlink(join(outside, 'docs'), join(root, 'linked'));
    await expect(readDocSafely(root, 'docs/link.md')).rejects.toThrow();
    await expect(readDocSafely(root, 'linked/d.md')).rejects.toThrow();
  });

  it('readDocSafely refuses traversal, missing and oversized files', async () => {
    await put(outside, 'x.md', 'secret');
    await expect(readDocSafely(root, '../x.md')).rejects.toThrow();
    await expect(readDocSafely(root, 'docs/missing.md')).rejects.toThrow();
    await put(root, 'docs/big.md', 'a'.repeat(MAX_FILE_SIZE + 1));
    await expect(readDocSafely(root, 'docs/big.md')).rejects.toThrow();
  });

  it('readDocSafely works when the root itself is under a symlink', async () => {
    await put(outside, 'docs/a.md', 'ok');
    const linkedRoot = join(root, 'repo');
    await symlink(outside, linkedRoot);
    expect(await readDocSafely(linkedRoot, 'docs/a.md')).toBe('ok');
  });
});

describe('token cache', () => {
  const tokenizer = { count: (t: string) => t.length, truncate: (t: string) => t };

  it('reuses by abs|mtime|size and recounts on change; pruneRepo drops stale keys', async () => {
    let reads = 0;
    const read = async () => (reads++, 'abcd');
    const doc = { abs: '/r/docs/a.md', size: 4, mtimeMs: 1 };
    expect(await countDocTokens(tokenizer, doc, read)).toBe(4);
    expect(await countDocTokens(tokenizer, doc, read)).toBe(4);
    expect(reads).toBe(1);
    expect(await countDocTokens(tokenizer, { ...doc, mtimeMs: 2 }, read)).toBe(4);
    expect(reads).toBe(2);
    pruneRepo('/r/', new Set([`${doc.abs}|2|4`]));
    await countDocTokens(tokenizer, { ...doc, mtimeMs: 2 }, read);
    expect(reads).toBe(2); // live key kept
    await countDocTokens(tokenizer, doc, read);
    expect(reads).toBe(3); // stale key was dropped
  });
});
