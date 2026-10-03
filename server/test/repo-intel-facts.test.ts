import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * SPEC-02 fact collection (AC-25, AC-26, AC-32, AC-34, AC-60, EC-4/5/6/16).
 * Real temp-dir clone; the DB-backed `repo` is patched like repo-intel-facade-degraded.test.ts.
 * Seam assumption (plan S1): repository reads `getRankRows`, `getEdges`, `getAllEndpoints`,
 * `getRepoMapCache`, `tryGetIndexState` (carrying `stats.bounded`).
 */

let root: string;
let n = 0;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'facts-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(dir: string, rel: string, content: string) {
  await mkdir(dirname(join(dir, rel)), { recursive: true });
  await writeFile(join(dir, rel), content);
}
async function newClone(): Promise<string> {
  const dir = join(root, `c${++n}`, 'clone');
  await mkdir(dir, { recursive: true });
  return dir;
}

const state = (over: Partial<IndexState> & { stats?: Record<string, unknown> } = {}): IndexState =>
  ({
    repoId: 'r1',
    status: 'full',
    filesIndexed: 3,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: 'indexedsha',
    indexerVersion: 1,
    updatedAt: new Date(0),
    ...over,
  }) as IndexState;

function svcFor(
  dir: string,
  o: {
    state?: IndexState | null;
    head?: string | Error;
    ranks?: { path: string; pagerank: number; percentile: number }[];
    edges?: { fromFile: string; toFile: string }[];
    endpoints?: string[];
  } = {},
) {
  const container = {
    config: { repoIntelEnabled: true },
    db: {} as never,
    git: {
      clonePathFor: () => dir,
      currentHead: async () => {
        if (o.head instanceof Error) throw o.head;
        return o.head ?? 'headsha';
      },
    },
  } as never;
  const svc = new RepoIntelService(container);
  const ranks = o.ranks ?? [];
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoBasics: async () => ({ id: 'r1', owner: 'o', name: 'r', defaultBranch: 'main', clonePath: null }),
    tryGetIndexState: async () => (o.state === undefined ? state() : o.state),
    getRankRows: async () => ranks,
    getRankedPaths: async () => ranks.map((r) => ({ path: r.path, rank: r.pagerank })),
    getEdges: async () => o.edges ?? [],
    getAllEndpoints: async () => o.endpoints ?? [],
    getRepoMapCache: async () => ({ mapText: 'REPO MAP TEXT', tokenCount: 3 }),
  };
  return svc;
}

async function richClone() {
  const dir = await newClone();
  await put(dir, 'package.json', JSON.stringify({
    main: 'src/a.ts',
    module: 'src/missing.ts',
    bin: { cli: 'src/b.ts' },
    scripts: { build: 'tsc', dev: 'tsx watch' },
    dependencies: { fastify: '^5' },
    devDependencies: { vitest: '^3' },
  }));
  await put(dir, 'pnpm-lock.yaml', 'lockfileVersion: 9');
  await put(dir, 'server/package.json', JSON.stringify({ scripts: { start: 'node .' }, dependencies: { zod: '^3', fastify: '^5' } }));
  await put(dir, 'Makefile', '.PHONY: build test\nbuild:\n\techo b\ntest:\n\techo t\nVAR := 1\n');
  await put(dir, 'docker-compose.yml', 'services:\n  api:\n    image: x\n  db:\n    image: y\nvolumes:\n  data: {}\n');
  await put(dir, '.env.example', 'SECRET=hunter2\nexport TOKEN=s3cr3t-token\n# COMMENTED=nope\n');
  await put(dir, 'src/a.ts', 'export const a = 1;');
  await put(dir, 'src/b.ts', 'export const b = 1;');
  await put(dir, 'src/c.ts', 'export const c = 1;');
  await put(dir, '.git/config', '[core]');
  await put(dir, '.git/HEAD', 'ref: x');
  await put(
    dir,
    'README.md',
    [
      '# Title',
      '[a](./src/a.ts) [gone](docs/missing.md) [web](https://x.com) [top](#top) [b](src/b.ts#L10) [out](../secret.md)',
      '',
      '```sh',
      '$ pnpm install',
      '# a comment',
      '',
      'pnpm dev',
      '```',
      '```js',
      'node ignored.js',
      '```',
    ].join('\n'),
  );
  await writeFile(join(dir, '..', 'secret.md'), 'outside the clone');
  return dir;
}

describe('collectFacts — deterministic facts (AC-25)', () => {
  it('stack: languages by extension, package manager from the lockfile, frameworks from manifests', async () => {
    const facts = await svcFor(await richClone()).collectFacts('r1');
    const ts = facts.stack.languages.find((l) => l.ext === '.ts');
    expect(ts).toEqual({ ext: '.ts', files: 3 });
    const langs = facts.stack.languages;
    for (let i = 1; i < langs.length; i++) {
      const [p, c] = [langs[i - 1]!, langs[i]!];
      expect(p.files > c.files || (p.files === c.files && p.ext < c.ext)).toBe(true);
    }
    expect(facts.stack.packageManager).toBe('pnpm');
    expect(facts.stack.frameworks).toEqual(['fastify', 'vitest', 'zod']);
  });

  it('structure: top-level directories with file counts, dir asc', async () => {
    const facts = await svcFor(await richClone()).collectFacts('r1');
    expect(facts.structure).toEqual([
      { dir: 'server', files: 1 },
      { dir: 'src', files: 3 },
    ]);
  });

  it('routes: the sorted, deduped union of indexed endpoints', async () => {
    const facts = await svcFor(await richClone(), { endpoints: ['POST /b', 'GET /a', 'GET /a'] }).collectFacts('r1');
    expect(facts.routes).toEqual(['GET /a', 'POST /b']);
  });

  it('EC-5 scripts: each manifest with its directory, root first', async () => {
    const facts = await svcFor(await richClone()).collectFacts('r1');
    expect(facts.scripts.manifests).toEqual([
      { dir: null, scripts: ['build', 'dev'] },
      { dir: 'server', scripts: ['start'] },
    ]);
  });

  it('scripts: Makefile targets, compose services, .env.example names, README shell commands', async () => {
    const { scripts } = await svcFor(await richClone()).collectFacts('r1');
    expect(scripts.makeTargets).toEqual(['build', 'test']);
    expect(scripts.composeServices).toEqual(['api', 'db']);
    expect(scripts.hasCompose).toBe(true);
    expect(scripts.envExampleNames).toEqual(['SECRET', 'TOKEN']);
    expect(scripts.hasEnvExample).toBe(true);
    expect(scripts.readmeCommands).toEqual(['pnpm install', 'pnpm dev']);
  });

  it('README links: existing repo-relative files only, in order, normalised, never outside the clone', async () => {
    const facts = await svcFor(await richClone()).collectFacts('r1');
    expect(facts.readme.links).toEqual(['src/a.ts', 'src/b.ts']);
    expect(facts.readme.text).toContain('# Title');
  });

  it('entry points exist on disk; root files are plain files', async () => {
    const facts = await svcFor(await richClone()).collectFacts('r1');
    expect([...facts.entryPoints].sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(facts.rootFiles).toEqual(expect.arrayContaining(['Makefile', 'README.md', 'package.json', 'pnpm-lock.yaml']));
    expect(facts.rootFiles).not.toContain('src');
    expect(facts.rootFiles).not.toContain('.git');
  });

  it('dependency manifests inside excluded directories are ignored', async () => {
    const dir = await newClone();
    await put(dir, 'package.json', JSON.stringify({ dependencies: { real: '1' } }));
    await put(dir, 'node_modules/dep/package.json', JSON.stringify({ scripts: { evil: 'x' }, dependencies: { evilpkg: '1' } }));
    const facts = await svcFor(dir).collectFacts('r1');
    expect(facts.stack.frameworks).toEqual(['real']);
    expect(facts.scripts.manifests.map((m) => m.dir)).toEqual([null]);
  });

  it('invalid package.json is ignored without throwing', async () => {
    const dir = await newClone();
    await put(dir, 'package.json', '{ not json');
    const facts = await svcFor(dir).collectFacts('r1');
    expect(facts.scripts.manifests).toEqual([]);
  });

  it('graph: rank rows plus in-degree as importedBy; edges mapped', async () => {
    const facts = await svcFor(await richClone(), {
      ranks: [
        { path: 'src/a.ts', pagerank: 0.5, percentile: 99 },
        { path: 'src/b.ts', pagerank: 0.2, percentile: 60 },
      ],
      edges: [
        { fromFile: 'src/a.ts', toFile: 'src/b.ts' },
        { fromFile: 'src/c.ts', toFile: 'src/b.ts' },
      ],
    }).collectFacts('r1');
    const byPath = Object.fromEntries(facts.graph.files.map((f) => [f.path, f]));
    expect(byPath['src/a.ts']).toMatchObject({ pagerank: 0.5, percentile: 99, importedBy: 0 });
    expect(byPath['src/b.ts']).toMatchObject({ pagerank: 0.2, percentile: 60, importedBy: 2 });
    expect(facts.graph.edges).toEqual([
      { from: 'src/a.ts', to: 'src/b.ts' },
      { from: 'src/c.ts', to: 'src/b.ts' },
    ]);
    expect(facts.repoMap).toBe('REPO MAP TEXT');
  });
});

describe('collectFacts — counts, commit and index state (AC-32, AC-34, EC-6, EC-16)', () => {
  it('AC-32: filesTotal counts every clone file except .git; filesIndexed comes from the index state', async () => {
    const facts = await svcFor(await richClone(), { state: state({ filesIndexed: 2 }) }).collectFacts('r1');
    // package.json, pnpm-lock, server/package.json, Makefile, compose, .env.example, 3x src, README = 10 (+ .git excluded)
    expect(facts.filesTotal).toBe(10);
    expect(facts.filesIndexed).toBe(2);
  });

  it('AC-34: filesBounded is true when the index left files out for its limit', async () => {
    const dir = await richClone();
    const bounded = await svcFor(dir, { state: state({ stats: { bounded: 7 } } as never) }).collectFacts('r1');
    const normal = await svcFor(dir, { state: state({ stats: { bounded: 0 } } as never) }).collectFacts('r1');
    expect(bounded.filesBounded).toBe(true);
    expect(normal.filesBounded).toBe(false);
  });

  it('EC-6: facts carry the index state stored at that moment', async () => {
    const facts = await svcFor(await richClone(), { state: state({ status: 'partial' }) }).collectFacts('r1');
    expect(facts.indexStatus).toBe('partial');
  });

  it('EC-16: no index row -> indexStatus missing and an empty graph', async () => {
    const facts = await svcFor(await richClone(), { state: null }).collectFacts('r1');
    expect(facts.indexStatus).toBe('missing');
    expect(facts.graph.edges).toEqual([]);
    expect(facts.graph.files).toEqual([]);
  });

  it('commitSha: clone HEAD, else the indexed sha, else empty', async () => {
    const dir = await richClone();
    expect((await svcFor(dir, { head: 'headsha' }).collectFacts('r1')).commitSha).toBe('headsha');
    expect((await svcFor(dir, { head: new Error('no git') }).collectFacts('r1')).commitSha).toBe('indexedsha');
    expect((await svcFor(dir, { head: new Error('no git'), state: null }).collectFacts('r1')).commitSha).toBe('');
  });

  it('EC-4: an empty clone yields empty facts without throwing', async () => {
    const facts = await svcFor(await newClone(), { state: state({ filesIndexed: 0 }) }).collectFacts('r1');
    expect(facts.filesTotal).toBe(0);
    expect(facts.structure).toEqual([]);
    expect(facts.stack.languages).toEqual([]);
    expect(facts.stack.packageManager).toBeNull();
    expect(facts.scripts.manifests).toEqual([]);
    expect(facts.readme.text).toBeNull();
  });

  it('a missing clone directory yields empty facts without throwing', async () => {
    const facts = await svcFor(join(root, 'does-not-exist')).collectFacts('r1');
    expect(facts.filesTotal).toBe(0);
    expect(facts.indexStatus).toBe('full');
  });
});

describe('collectFacts — determinism and secrets (AC-26, AC-60)', () => {
  it('AC-26: the same clone and index state give deeply equal facts', async () => {
    const dir = await richClone();
    const svc = svcFor(dir, { endpoints: ['GET /a'] });
    expect(await svc.collectFacts('r1')).toEqual(await svc.collectFacts('r1'));
  });

  it('AC-60: .env.example values never appear in the facts', async () => {
    const facts = await svcFor(await richClone()).collectFacts('r1');
    const json = JSON.stringify(facts);
    expect(json).not.toContain('hunter2');
    expect(json).not.toContain('s3cr3t-token');
    expect(facts.scripts.envExampleNames).toContain('SECRET');
  });
});
