import { describe, it, expect } from 'vitest';
import {
  rankFiles,
  selectReadingPath,
  selectCriticalPaths,
  tourNotes,
  tourStatus,
  isCandidateCommand,
  skeletonCommands,
  buildSkeletonSections,
} from '../src/modules/onboarding/model.js';
import { mkFacts, gf } from './helpers/onboarding-facts.js';

const edge = (from: string, to: string) => ({ from, to });

describe('rankFiles (AC-28)', () => {
  it('rank = pagerank x (1 + hotness), sorted rank desc then path asc', () => {
    const facts = mkFacts({
      graph: {
        files: [gf('b.ts', 0.15, 2, 40), gf('a.ts', 0.1, 1, 30), gf('c.ts', 0.15, 3, 50)],
        edges: [edge('a.ts', 'b.ts')],
      },
    });
    const r = rankFiles(facts, { 'a.ts': 1 }); // a: 0.1*2 = 0.2 ; b,c: 0.15 (tie)
    expect(r.map((x) => x.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(r[0]).toMatchObject({ path: 'a.ts', pagerank: 0.1, hotness: 1, percentile: 30, importedBy: 1 });
    expect(r[0]!.rank).toBeCloseTo(0.2, 10);
    expect(r[1]!.hotness).toBe(0);
    expect(r[1]!.rank).toBeCloseTo(0.15, 10);
  });
});

describe('selectReadingPath (AC-28, AC-37, AC-31)', () => {
  const files = [
    gf('src/a.ts', 0.5, 1, 99),
    gf('src/b.ts', 0.4, 2, 90),
    gf('src/a.test.ts', 0.9, 0),
    gf('src/types.d.ts', 0.8, 0),
    gf('db/migrations/001.ts', 0.7, 0),
    gf('src/generated/api.ts', 0.6, 0),
    gf('dist/app.min.js', 0.55, 0),
    gf('vitest.config.ts', 0.45, 0),
  ];
  const facts = mkFacts({ graph: { files, edges: [edge('src/a.ts', 'src/b.ts')] } });

  it('excludes test, config, d.ts, migration and generated files', () => {
    expect(selectReadingPath(facts, {}).map((i) => i.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('wire shape {path, reason, rank, hotness}: entry reason for the entry point, percentile reason otherwise (AC-37)', () => {
    const r = selectReadingPath(facts, {});
    expect(r[0]).toEqual({ path: 'src/a.ts', reason: 'Entry point · reaches 1 indexed files', rank: 0.5, hotness: 0 });
    expect(r[1]).toEqual({ path: 'src/b.ts', reason: 'Rank percentile 90', rank: 0.4, hotness: 0 });
  });

  it('hotness reorders the ranked (non-entry) part of the list', () => {
    const f = mkFacts({
      graph: {
        files: [gf('src/main.ts', 0.01), gf('src/a.ts', 0.5), gf('src/b.ts', 0.4)],
        edges: [edge('src/main.ts', 'src/a.ts'), edge('src/main.ts', 'src/b.ts')],
      },
    });
    expect(selectReadingPath(f, {}).map((i) => i.path)).toEqual(['src/main.ts', 'src/a.ts', 'src/b.ts']);
    const r = selectReadingPath(f, { 'src/b.ts': 1 }); // b: 0.8 > a: 0.5
    expect(r.map((i) => i.path)).toEqual(['src/main.ts', 'src/b.ts', 'src/a.ts']);
    expect(r[1]!.hotness).toBe(1);
  });

  it('is capped at 10', () => {
    const many = Array.from({ length: 14 }, (_, i) => gf(`src/f${String(i).padStart(2, '0')}.ts`, 0.5 - i / 100, 1));
    const f = mkFacts({ graph: { files: many, edges: [edge('src/f00.ts', 'src/f01.ts')] } });
    const r = selectReadingPath(f, {});
    expect(r).toHaveLength(10);
    expect(r[0]!.path).toBe('src/f00.ts');
  });

  it('AC-31: no edges -> README links, then entry points, then root files asc, deduped, max 10', () => {
    const f = mkFacts({
      graph: { files: [gf('src/x.ts', 0.9, 5)], edges: [] },
      readme: { text: '', links: ['docs/guide.ts', 'src/main.ts'] },
      entryPoints: ['src/main.ts', 'bin/cli.js'],
      rootFiles: ['index.ts', 'a.ts', 'z.ts'].sort(),
    });
    const r = selectReadingPath(f, {});
    expect(r.map((i) => i.path)).toEqual(['docs/guide.ts', 'src/main.ts', 'bin/cli.js', 'a.ts', 'index.ts', 'z.ts']);
    expect(r.every((i) => i.rank === 0 && i.hotness === 0)).toBe(true);
  });

  it('AC-31: fallback is cut to 10', () => {
    const f = mkFacts({ rootFiles: Array.from({ length: 15 }, (_, i) => `r${String(i).padStart(2, '0')}.ts`) });
    expect(selectReadingPath(f, {})).toHaveLength(10);
  });

  it('EC-4: empty repository -> empty list, no throw', () => {
    expect(selectReadingPath(mkFacts({ stack: { languages: [], packageManager: null, frameworks: [] } }), {})).toEqual([]);
  });
});

describe('selectCriticalPaths (AC-30, AC-31, AC-37)', () => {
  const files = [
    gf('x.test.ts', 0.9, 0), // junk: never a root
    gf('a.ts', 0.5, 0),
    gf('b.ts', 0.4, 0),
    gf('c.ts', 0.3, 0),
    gf('d.ts', 0.2, 0),
    gf('e.ts', 0.1, 0),
    gf('f.ts', 0.09, 2),
    gf('g.ts', 0.08, 3),
  ];
  const edges = [edge('a.ts', 'g.ts'), edge('a.ts', 'f.ts'), edge('f.ts', 'g.ts'), edge('b.ts', 'g.ts')];
  const facts = mkFacts({ graph: { files, edges } });

  it('chains start at entry points a, b (reach 2, 1), then the top-ranked c, d, e; each step the import with the highest reach; <=3 per chain, distinct, <=6', () => {
    // chains: a>f>g | b>g | c | d | e  -> a,f,g,b,c,d (e cut by the 6 limit)
    expect(selectCriticalPaths(facts, {}).map((i) => i.path)).toEqual(['a.ts', 'f.ts', 'g.ts', 'b.ts', 'c.ts', 'd.ts']);
  });

  it('uses the deterministic "Imported by n indexed files" reason', () => {
    const r = selectCriticalPaths(facts, {});
    expect(r.find((i) => i.path === 'f.ts')).toEqual({ path: 'f.ts', reason: 'Imported by 2 indexed files' });
  });

  it('AC-31: no edges -> same fallback order, <=6', () => {
    const f = mkFacts({ rootFiles: Array.from({ length: 9 }, (_, i) => `r${i}.ts`) });
    const r = selectCriticalPaths(f, {});
    expect(r.map((i) => i.path)).toEqual(['r0.ts', 'r1.ts', 'r2.ts', 'r3.ts', 'r4.ts', 'r5.ts']);
  });
});

const ENTRY = (n: number) => `Entry point · reaches ${n} indexed files`;
const paths = (r: { path: string }[]) => r.map((i) => i.path);
/** files: [path, pagerank]; every file gets percentile 50, importedBy 0. */
const mk = (files: [string, number][], edges: [string, string][], entryPoints: string[] = []) =>
  mkFacts({ graph: { files: files.map(([p, r]) => gf(p, r)), edges: edges.map(([a, b]) => edge(a, b)) }, entryPoints });

describe('entry points (AC-63, AC-28, AC-30, AC-37, EC-19..EC-22)', () => {
  const t1 = mkFacts({
    graph: {
      files: [
        gf('src/main.ts', 0.01), gf('src/lib.ts', 0.5), gf('src/util.ts', 0.9, 0, 77), gf('src/cli.ts', 0.04),
        gf('src/api.ts', 0.03), gf('src/srv.ts', 0.03), gf('src/job.ts', 0.02),
      ],
      edges: [
        edge('src/main.ts', 'src/lib.ts'), edge('src/main.ts', 'src/util.ts'), edge('src/lib.ts', 'src/cli.ts'),
        edge('src/cli.ts', 'src/util.ts'), edge('src/api.ts', 'src/util.ts'), edge('src/srv.ts', 'src/util.ts'),
        edge('src/job.ts', 'src/util.ts'),
      ],
    },
    entryPoints: ['src/cli.ts'],
  });

  it('T1 AC-63: entries by reach desc, rank desc, path asc; 3 at the head, then rank order', () => {
    expect(paths(selectReadingPath(t1, {}))).toEqual([
      'src/main.ts', 'src/cli.ts', 'src/api.ts', 'src/util.ts', 'src/lib.ts', 'src/srv.ts', 'src/job.ts',
    ]);
  });

  it('T2 AC-63/EC-22: junk roots, junk/generated/unranked manifest entries, leaf-only files are no entry points; test-only and unindexed importers do not block', () => {
    const f = mk(
      [['src/app.ts', 0.5], ['src/x.ts', 0.4], ['src/y.ts', 0.3], ['src/orphan.ts', 0.2], ['src/lonely.ts', 0.1],
        ['src/main.test.ts', 0.9], ['vitest.config.ts', 0.8], ['dist/app.min.js', 0.7], ['src/app.test.ts', 0.6]],
      [['src/main.test.ts', 'src/x.ts'], ['vitest.config.ts', 'src/y.ts'], ['src/app.test.ts', 'src/app.ts'],
        ['src/app.ts', 'src/x.ts'], ['src/gone.ts', 'src/orphan.ts'], ['src/orphan.ts', 'src/y.ts']],
      ['dist/app.min.js', 'bin/missing.js'],
    );
    const r = selectReadingPath(f, {});
    expect(r.filter((i) => i.reason.startsWith('Entry point')).map((i) => i.path).sort()).toEqual(['src/app.ts', 'src/orphan.ts']);
  });

  it('T3 AC-30: a chain step prefers reach over rank', () => {
    const f = mk(
      [['src/main.ts', 0.01], ['src/hi.ts', 0.9], ['src/deep.ts', 0.1], ['src/x1.ts', 0.05], ['src/x2.ts', 0.04]],
      [['src/main.ts', 'src/hi.ts'], ['src/main.ts', 'src/deep.ts'], ['src/deep.ts', 'src/x1.ts'], ['src/x1.ts', 'src/x2.ts']],
    );
    expect(paths(selectCriticalPaths(f, {})).slice(0, 3)).toEqual(['src/main.ts', 'src/deep.ts', 'src/x1.ts']);
  });

  it('T4a AC-30: equal reach -> the higher-ranked import is the step', () => {
    const f = mk(
      [['r.ts', 0.9], ['o.ts', 0.5], ['p.ts', 0.3], ['q.ts', 0.1]],
      [['r.ts', 'o.ts'], ['r.ts', 'p.ts'], ['o.ts', 'q.ts'], ['p.ts', 'q.ts']],
    );
    expect(paths(selectCriticalPaths(f, {}))).toEqual(['r.ts', 'o.ts', 'q.ts', 'p.ts']);
  });

  it('T4b AC-30: equal reach and rank -> path asc is the step', () => {
    const f = mk(
      [['s.ts', 0.9], ['m.ts', 0.3], ['n.ts', 0.3], ['q.ts', 0.1]],
      [['s.ts', 'n.ts'], ['s.ts', 'm.ts'], ['m.ts', 'q.ts'], ['n.ts', 'q.ts']],
    );
    expect(paths(selectCriticalPaths(f, {}))).toEqual(['s.ts', 'm.ts', 'q.ts', 'n.ts']);
  });

  it('T5a AC-30/EC-21: 2 entry points start chains 1-2, then the top-ranked non-start files', () => {
    const f = mk(
      [['e1.ts', 0.9], ['e2.ts', 0.02], ['t1.ts', 0.8], ['t2.ts', 0.7], ['t3.ts', 0.6], ['t4.ts', 0.5], ['c1.ts', 0.011], ['c2.ts', 0.012]],
      [['e1.ts', 'c1.ts'], ['e2.ts', 'c2.ts']],
    );
    const r = paths(selectCriticalPaths(f, {}));
    expect(r).toEqual(['e1.ts', 'c1.ts', 'e2.ts', 'c2.ts', 't1.ts', 't2.ts']);
    expect(new Set(r).size).toBe(r.length);
  });

  it('T5b EC-20: 6 graph roots -> only the first 5 (AC-63 order) start chains, <=6 files', () => {
    const roots = [1, 2, 3, 4, 5, 6].map((i) => `r${i}.ts`);
    const f = mk(
      [...roots.map((r, i): [string, number] => [r, 0.07 - i / 100]), ['z.ts', 0.9]],
      roots.map((r): [string, string] => [r, 'z.ts']),
    );
    const r = paths(selectCriticalPaths(f, {}));
    expect(r).toEqual(['r1.ts', 'z.ts', 'r2.ts', 'r3.ts', 'r4.ts', 'r5.ts']);
    expect(r).not.toContain('r6.ts');
  });

  it('T6 AC-37: entry reason vs "Imported by n" in the critical paths', () => {
    const f = mkFacts({
      graph: {
        files: [gf('e1.ts', 0.9), gf('c1.ts', 0.011, 4), gf('t1.ts', 0.8)],
        edges: [edge('e1.ts', 'c1.ts')],
      },
    });
    const r = selectCriticalPaths(f, {});
    expect(r.find((i) => i.path === 'e1.ts')!.reason).toBe(ENTRY(1));
    expect(r.find((i) => i.path === 'c1.ts')!.reason).toBe('Imported by 4 indexed files');
    expect(r.find((i) => i.path === 't1.ts')!.reason).toBe('Imported by 0 indexed files');
  });

  it('T6 AC-37: entry points outside the first 3 keep the entry reason in the reading path', () => {
    const r = selectReadingPath(t1, {});
    const reason = (p: string) => r.find((i) => i.path === p)!.reason;
    expect(reason('src/srv.ts')).toBe(ENTRY(1));
    expect(reason('src/job.ts')).toBe(ENTRY(1));
    expect(reason('src/util.ts')).toBe('Rank percentile 77');
  });

  describe('EC-19: no entry points', () => {
    it('edges only from junk files -> rank order, percentile reasons, chains from the top 5, no new note', () => {
      const f = mkFacts({
        graph: {
          files: [
            gf('src/a.ts', 0.5), gf('src/b.ts', 0.4), gf('src/c.ts', 0.3), gf('src/d.ts', 0.2), gf('src/e.ts', 0.1),
            gf('src/f.ts', 0.05), gf('src/a.test.ts', 0.9), gf('vitest.config.ts', 0.8),
          ],
          edges: [edge('src/a.test.ts', 'src/a.ts'), edge('vitest.config.ts', 'src/b.ts')],
        },
        entryPoints: ['vitest.config.ts'],
      });
      const rp = selectReadingPath(f, {});
      expect(paths(rp)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts']);
      expect(rp.every((i) => i.reason === 'Rank percentile 50')).toBe(true);
      expect(paths(selectCriticalPaths(f, {}))).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts']);
      expect(tourNotes(f, true)).toEqual([]);
    });

    it('a pure cycle has no entry points', () => {
      const f = mk([['a.ts', 0.5], ['b.ts', 0.4]], [['a.ts', 'b.ts'], ['b.ts', 'a.ts']]);
      expect(selectReadingPath(f, {}).every((i) => i.reason.startsWith('Rank percentile'))).toBe(true);
      expect(selectCriticalPaths(f, {}).every((i) => i.reason.startsWith('Imported by'))).toBe(true);
    });
  });

  describe('EC-21: cycles and duplicates', () => {
    const cyc = mk([['z.ts', 0.01], ['x.ts', 0.5], ['y.ts', 0.4]], [['z.ts', 'x.ts'], ['x.ts', 'y.ts'], ['y.ts', 'x.ts']], ['z.ts']);

    it('reach counts each file once through a cycle; the chain does not repeat a file', () => {
      expect(selectReadingPath(cyc, {})[0]).toMatchObject({ path: 'z.ts', reason: ENTRY(2) });
      expect(paths(selectCriticalPaths(cyc, {}))).toEqual(['z.ts', 'x.ts', 'y.ts']);
    });

    it('a manifest entry that is also a graph root appears once in the reading path', () => {
      expect(paths(selectReadingPath(cyc, {})).filter((p) => p === 'z.ts')).toHaveLength(1);
    });

    it('an entry point that is also top-ranked appears once in each list', () => {
      const f = mk([['a.ts', 0.9], ['b.ts', 0.1]], [['a.ts', 'b.ts']], ['a.ts']);
      expect(paths(selectReadingPath(f, {}))).toEqual(['a.ts', 'b.ts']);
      expect(paths(selectCriticalPaths(f, {}))).toEqual(['a.ts', 'b.ts']);
    });
  });

  describe('EC-20: quick-blog shape', () => {
    const C = 'client/src/';
    const S = 'server/src/';
    const f = mk(
      [
        [`${C}utils/helpers.js`, 0.3], [`${C}constants/messages.js`, 0.25], [`${C}assets/assets.js`, 0.2],
        [`${S}models/Blog.js`, 0.08], [`${C}App.jsx`, 0.05], [`${S}controllers/blogController.js`, 0.05],
        [`${C}pages/public/index.js`, 0.04], [`${S}routes/blogRoutes.js`, 0.04], [`${C}pages/public/Home.jsx`, 0.03],
        [`${S}app.js`, 0.02], [`${C}main.jsx`, 0.01], ['server/server.js', 0.01], ['server/scripts/seed.js', 0.01],
      ],
      [
        [`${C}main.jsx`, `${C}App.jsx`], [`${C}App.jsx`, `${C}pages/public/index.js`], [`${C}App.jsx`, `${C}utils/helpers.js`],
        [`${C}pages/public/index.js`, `${C}pages/public/Home.jsx`], [`${C}pages/public/Home.jsx`, `${C}utils/helpers.js`],
        [`${C}pages/public/Home.jsx`, `${C}constants/messages.js`], [`${C}pages/public/Home.jsx`, `${C}assets/assets.js`],
        ['server/server.js', `${S}routes/blogRoutes.js`], [`${S}routes/blogRoutes.js`, `${S}controllers/blogController.js`],
        [`${S}app.js`, `${S}controllers/blogController.js`], [`${S}controllers/blogController.js`, `${S}models/Blog.js`],
        ['server/scripts/seed.js', `${S}models/Blog.js`],
      ],
      [`${S}app.js`],
    );

    it('T9 reading path starts at the three highest-reach entry points', () => {
      expect(paths(selectReadingPath(f, {}))).toEqual([
        `${C}main.jsx`, 'server/server.js', `${S}app.js`, `${C}utils/helpers.js`, `${C}constants/messages.js`,
        `${C}assets/assets.js`, `${S}models/Blog.js`, `${C}App.jsx`, `${S}controllers/blogController.js`,
        `${C}pages/public/index.js`,
      ]);
    });

    it('T9 critical paths are the EC-20 chains', () => {
      expect(paths(selectCriticalPaths(f, {}))).toEqual([
        `${C}main.jsx`, `${C}App.jsx`, `${C}pages/public/index.js`, 'server/server.js', `${S}routes/blogRoutes.js`,
        `${S}controllers/blogController.js`,
      ]);
    });
  });

  it('T10 NFR-2: 5,000 files / 2,500 roots stay fast and reach is counted', () => {
    const id = (p: string, i: number) => `${p}${String(i).padStart(4, '0')}.ts`;
    const roots = Array.from({ length: 2500 }, (_, i) => id('r', i));
    const chain = Array.from({ length: 2500 }, (_, i) => id('c', i));
    const f = mk(
      [...roots.map((p): [string, number] => [p, 0.001]), ...chain.map((p): [string, number] => [p, 0.0005])],
      [
        ...roots.map((r): [string, string] => [r, chain[0]!]),
        ...chain.slice(1).map((c, i): [string, string] => [chain[i]!, c]),
      ],
    );
    const t0 = performance.now();
    const rp = selectReadingPath(f, {});
    selectCriticalPaths(f, {});
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(rp[0]!.reason).toBe(ENTRY(2500));
  });
});

describe('tourNotes (AC-33, AC-34, AC-29, AC-31, EC-16)', () => {
  const g = { files: [gf('a.ts', 0.1)], edges: [edge('a.ts', 'b.ts')] };
  it('full index, graph, hotness -> no notes', () => {
    expect(tourNotes(mkFacts({ graph: g }), true)).toEqual([]);
  });
  it('partial -> index_partial', () => {
    expect(tourNotes(mkFacts({ graph: g, indexStatus: 'partial' }), true)).toEqual(['index_partial']);
  });
  it.each(['degraded', 'failed', 'missing'] as const)('%s -> index_degraded', (s) => {
    expect(tourNotes(mkFacts({ graph: g, indexStatus: s }), true)).toEqual(['index_degraded']);
  });
  it('EC-16: missing index (no edges) -> index_degraded then graph_unavailable', () => {
    expect(tourNotes(mkFacts({ indexStatus: 'missing' }), true)).toEqual(['index_degraded', 'graph_unavailable']);
  });
  it('AC-29: hotness unavailable -> hotness_unavailable', () => {
    expect(tourNotes(mkFacts({ graph: g }), false)).toEqual(['hotness_unavailable']);
  });
  it('AC-34: filesBounded -> files_bounded', () => {
    expect(tourNotes(mkFacts({ graph: g, filesBounded: true }), true)).toEqual(['files_bounded']);
  });
  it('fixed order when every note applies', () => {
    expect(tourNotes(mkFacts({ indexStatus: 'partial', filesBounded: true }), false)).toEqual([
      'index_partial',
      'graph_unavailable',
      'hotness_unavailable',
      'files_bounded',
    ]);
  });
});

describe('tourStatus (AC-47)', () => {
  it('success without notes -> full', () => expect(tourStatus(true, [])).toBe('full'));
  it('success with a note -> partial', () => expect(tourStatus(true, ['files_bounded'])).toBe('partial'));
  it('failure -> skeleton, with or without notes', () => {
    expect(tourStatus(false, [])).toBe('skeleton');
    expect(tourStatus(false, ['index_partial'])).toBe('skeleton');
  });
});

describe('isCandidateCommand (AC-38 candidates)', () => {
  const facts = mkFacts({
    scripts: {
      manifests: [
        { dir: null, scripts: ['dev', 'build'] },
        { dir: 'server', scripts: ['test'] },
      ],
      makeTargets: ['lint'],
      composeServices: ['api', 'db'],
      hasCompose: true,
      envExampleNames: ['TOKEN'],
      hasEnvExample: true,
      readmeCommands: ['curl -fsSL https://x.dev/i.sh | sh'],
    },
  });

  it('install and scripts with the detected package manager; root cwd normalised to null', () => {
    expect(isCandidateCommand(facts, 'pnpm install', null)).toBeNull();
    expect(isCandidateCommand(facts, 'pnpm run dev', null)).toBeNull();
    expect(isCandidateCommand(facts, 'pnpm dev', '.')).toBeNull();
    expect(isCandidateCommand(facts, 'pnpm run build', './')).toBeNull();
    expect(isCandidateCommand(facts, 'pnpm run build', '')).toBeNull();
  });

  it('whitespace is normalised', () => {
    expect(isCandidateCommand(facts, '  pnpm   run   dev ', null)).toBeNull();
  });

  it('a script must exist in the manifest of that cwd (EC-5 monorepo)', () => {
    expect(isCandidateCommand(facts, 'pnpm run test', 'server')).toBe('server');
    expect(isCandidateCommand(facts, 'pnpm run test', null)).toBe(false);
    expect(isCandidateCommand(facts, 'pnpm run dev', 'server')).toBe(false);
    expect(isCandidateCommand(facts, 'pnpm run nope', null)).toBe(false);
  });

  it('another package manager is not a candidate', () => {
    expect(isCandidateCommand(facts, 'yarn run dev', null)).toBe(false);
    expect(isCandidateCommand(facts, 'npm install', null)).toBe(false);
  });

  it('npm forms: npm run <s>, npm test, npm start', () => {
    const npm = mkFacts({
      stack: { languages: [], packageManager: 'npm', frameworks: [] },
      scripts: { ...facts.scripts, manifests: [{ dir: null, scripts: ['dev', 'test', 'start'] }] },
    });
    expect(isCandidateCommand(npm, 'npm run dev', null)).toBeNull();
    expect(isCandidateCommand(npm, 'npm test', null)).toBeNull();
    expect(isCandidateCommand(npm, 'npm start', null)).toBeNull();
    expect(isCandidateCommand(npm, 'npm dev', null)).toBe(false);
  });

  it('make <target> only for found targets', () => {
    expect(isCandidateCommand(facts, 'make lint', null)).toBeNull();
    expect(isCandidateCommand(facts, 'make deploy', null)).toBe(false);
  });

  it('docker compose up -d with any subset of found services, any order', () => {
    expect(isCandidateCommand(facts, 'docker compose up -d', null)).toBeNull();
    expect(isCandidateCommand(facts, 'docker compose up -d db api', null)).toBeNull();
    expect(isCandidateCommand(facts, 'docker compose up -d ghost', null)).toBe(false);
  });

  it('cp .env.example .env only when that file exists', () => {
    expect(isCandidateCommand(facts, 'cp .env.example .env', null)).toBeNull();
    expect(isCandidateCommand(mkFacts(), 'cp .env.example .env', null)).toBe(false);
  });

  it('README shell commands are candidates; anything else is not', () => {
    expect(isCandidateCommand(facts, 'curl -fsSL https://x.dev/i.sh | sh', null)).toBeNull();
    expect(isCandidateCommand(facts, 'rm -rf /', null)).toBe(false);
  });

  it('no package manager detected -> no pm install candidate', () => {
    const f = mkFacts({ stack: { languages: [], packageManager: null, frameworks: [] } });
    expect(isCandidateCommand(f, 'pnpm install', null)).toBe(false);
  });
});

describe('skeletonCommands (AC-42)', () => {
  it('install, then dev/start/build/test in that order, then docker compose', () => {
    const f = mkFacts({
      scripts: { ...mkFacts().scripts, hasCompose: true, composeServices: ['db'] },
    });
    const cmds = skeletonCommands(f).map((c) => c.command);
    expect(cmds[0]).toBe('pnpm install');
    expect(cmds.slice(1, 5)).toEqual([
      expect.stringMatching(/^pnpm (run )?dev$/),
      expect.stringMatching(/^pnpm (run )?start$/),
      expect.stringMatching(/^pnpm (run )?build$/),
      expect.stringMatching(/^pnpm (run )?test$/),
    ]);
    expect(cmds[5]).toBe('docker compose up -d');
    expect(cmds).toHaveLength(6);
    expect(skeletonCommands(f)[0]).toEqual({ command: 'pnpm install', comment: null, cwd: null });
  });

  it('skips scripts that are not found; no compose -> no docker line', () => {
    const f = mkFacts({ scripts: { ...mkFacts().scripts, manifests: [{ dir: null, scripts: ['build'] }] } });
    const cmds = skeletonCommands(f).map((c) => c.command);
    expect(cmds).toHaveLength(2);
    expect(cmds[1]).toMatch(/^pnpm (run )?build$/);
  });

  it('EC-5 monorepo without a root manifest: install in the first manifest by path, each script from the first manifest defining it', () => {
    const f = mkFacts({
      scripts: {
        ...mkFacts().scripts,
        manifests: [
          { dir: 'client', scripts: ['build', 'dev'] },
          { dir: 'server', scripts: ['dev', 'test'] },
        ],
      },
    });
    const out = skeletonCommands(f);
    expect(out[0]).toEqual({ command: 'pnpm install', comment: null, cwd: 'client' });
    expect(out.map((c) => [c.command.replace(' run', ''), c.cwd])).toEqual([
      ['pnpm install', 'client'],
      ['pnpm dev', 'client'],
      ['pnpm build', 'client'],
      ['pnpm test', 'server'],
    ]);
  });

  it('no package manager -> no install, npm run for scripts', () => {
    const f = mkFacts({ stack: { languages: [], packageManager: null, frameworks: [] } });
    const cmds = skeletonCommands(f).map((c) => c.command);
    expect(cmds[0]).toBe('npm run dev');
    expect(cmds.some((c) => /install/.test(c))).toBe(false);
  });

  it('is deterministic and at most 8', () => {
    const f = mkFacts();
    expect(skeletonCommands(f)).toEqual(skeletonCommands(f));
    expect(skeletonCommands(f).length).toBeLessThanOrEqual(8);
  });
});

describe('buildSkeletonSections (AC-42, EC-4, EC-16)', () => {
  const facts = mkFacts({
    routes: ['GET /a', 'POST /b'],
    stack: { languages: [{ ext: '.ts', files: 7 }], packageManager: 'pnpm', frameworks: ['fastify'] },
    structure: [{ dir: 'src', files: 7 }],
    graph: { files: [gf('src/a.ts', 0.5, 1, 99), gf('src/b.ts', 0.4, 2, 90)], edges: [edge('src/a.ts', 'src/b.ts')] },
  });

  it('overview is a markdown bullet list of stack, structure and route count, with no diagram', () => {
    const s = buildSkeletonSections(facts, {});
    expect(s.architecture.diagram).toBeNull();
    expect(s.architecture.body).toMatch(/^- \*\*Stack:\*\*/m);
    expect(s.architecture.body).toMatch(/^- \*\*Structure:\*\*.*src/m);
    expect(s.architecture.body).toMatch(/^- \*\*Routes:\*\* 2 HTTP endpoints/m);
    expect(s.architecture.body).toContain('.ts');
  });

  it('lists come from the selectors, how_to_run from skeletonCommands, first_tasks empty', () => {
    const s = buildSkeletonSections(facts, {});
    expect(s.reading_path).toEqual(selectReadingPath(facts, {}));
    expect(s.critical_paths).toEqual(selectCriticalPaths(facts, {}));
    expect(s.how_to_run).toEqual(skeletonCommands(facts));
    expect(s.first_tasks).toEqual([]);
  });

  it('same facts -> identical skeleton', () => {
    expect(buildSkeletonSections(facts, {})).toEqual(buildSkeletonSections(facts, {}));
  });

  it('EC-4/EC-16: empty facts still produce a valid skeleton with empty lists', () => {
    const empty = mkFacts({
      indexStatus: 'missing',
      filesTotal: 0,
      filesIndexed: 0,
      stack: { languages: [], packageManager: null, frameworks: [] },
      structure: [],
      scripts: { ...mkFacts().scripts, manifests: [] },
    });
    const s = buildSkeletonSections(empty, {});
    expect(s.reading_path).toEqual([]);
    expect(s.critical_paths).toEqual([]);
    expect(s.how_to_run).toEqual([]);
    expect(typeof s.architecture.body).toBe('string');
  });
});
