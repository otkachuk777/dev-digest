import type { RepoFacts } from '../../src/modules/repo-intel/index.js';

/** Minimal valid RepoFacts; override any top-level key (shallow). */
export function mkFacts(over: Partial<RepoFacts> = {}): RepoFacts {
  return {
    commitSha: 'abc123',
    indexStatus: 'full',
    filesTotal: 10,
    filesIndexed: 10,
    filesBounded: false,
    stack: { languages: [{ ext: '.ts', files: 10 }], packageManager: 'pnpm', frameworks: [] },
    structure: [{ dir: 'src', files: 10 }],
    routes: [],
    scripts: {
      manifests: [{ dir: null, scripts: ['build', 'dev', 'start', 'test'] }],
      makeTargets: [],
      composeServices: [],
      hasCompose: false,
      envExampleNames: [],
      hasEnvExample: false,
      readmeCommands: [],
    },
    graph: { files: [], edges: [] },
    readme: { text: null, links: [] },
    entryPoints: [],
    rootFiles: [],
    repoMap: '',
    ...over,
  };
}

export type GFile = { path: string; pagerank: number; percentile: number; importedBy: number };
export const gf = (path: string, pagerank: number, importedBy = 0, percentile = 50): GFile => ({
  path,
  pagerank,
  percentile,
  importedBy,
});
