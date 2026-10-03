/**
 * Clone-walking half of `RepoIntel.collectFacts`: all fs I/O lives here, the
 * parsing is pure (`helpers.ts`). Never throws — unreadable pieces are skipped.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, posix, relative, resolve, sep } from 'node:path';
import type { RepoFacts } from './types.js';
import { EXCLUDED_DIRS } from './constants.js';
import {
  detectPackageManager,
  languagesByExt,
  parseComposeServices,
  parseEnvExampleNames,
  parseMakefileTargets,
  parsePackageJson,
  parseReadmeLinks,
  parseReadmeShellCommands,
  topLevelStructure,
} from './helpers.js';

export type CloneFacts = Pick<
  RepoFacts,
  'filesTotal' | 'stack' | 'structure' | 'scripts' | 'readme' | 'entryPoints' | 'rootFiles'
>;

export function emptyCloneFacts(): CloneFacts {
  return {
    filesTotal: 0,
    stack: { languages: [], packageManager: null, frameworks: [] },
    structure: [],
    scripts: {
      manifests: [],
      makeTargets: [],
      composeServices: [],
      hasCompose: false,
      envExampleNames: [],
      hasEnvExample: false,
      readmeCommands: [],
    },
    readme: { text: null, links: [] },
    entryPoints: [],
    rootFiles: [],
  };
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const EXCLUDED = new Set<string>(EXCLUDED_DIRS);
const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];

async function isFileInside(root: string, rel: string): Promise<boolean> {
  const abs = resolve(root, rel);
  if (!abs.startsWith(resolve(root) + sep)) return false;
  try {
    return (await stat(abs)).isFile();
  } catch {
    return false;
  }
}

async function readText(root: string, rel: string): Promise<string | null> {
  try {
    return await readFile(join(root, rel), 'utf8');
  } catch {
    return null;
  }
}

export async function collectCloneFacts(root: string): Promise<CloneFacts> {
  const facts = emptyCloneFacts();
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch {
    return facts;
  }
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join('/'))
    .filter((p) => p !== '.git' && !p.startsWith('.git/'))
    .sort(cmp);

  const rootFiles = files.filter((p) => !p.includes('/'));
  facts.filesTotal = files.length;
  facts.rootFiles = rootFiles;
  facts.structure = topLevelStructure(files);
  facts.stack.languages = languagesByExt(files);
  facts.stack.packageManager = detectPackageManager(rootFiles);

  // Manifests: depth <= 3 directories, never inside excluded dirs. Root first, then dir asc.
  const manifestPaths = files
    .filter((p) => p === 'package.json' || p.endsWith('/package.json'))
    .filter((p) => {
      const segs = p.split('/').slice(0, -1);
      return segs.length <= 3 && !segs.some((s) => EXCLUDED.has(s));
    });
  const frameworks = new Set<string>();
  const entries2 = new Set<string>();
  for (const p of manifestPaths) {
    const parsed = parsePackageJson((await readText(root, p)) ?? '');
    if (!parsed) continue;
    const dir = p === 'package.json' ? null : p.slice(0, -'/package.json'.length);
    facts.scripts.manifests.push({ dir, scripts: parsed.scripts });
    parsed.deps.forEach((d) => frameworks.add(d));
    for (const e of parsed.entries) {
      const rel = posix.normalize(dir ? `${dir}/${e}` : e);
      if (await isFileInside(root, rel)) entries2.add(rel);
    }
  }
  facts.scripts.manifests.sort((a, b) =>
    a.dir === null ? -1 : b.dir === null ? 1 : cmp(a.dir, b.dir),
  );
  facts.stack.frameworks = [...frameworks].sort(cmp);
  facts.entryPoints = [...entries2].sort(cmp);

  if (rootFiles.includes('Makefile')) {
    facts.scripts.makeTargets = parseMakefileTargets((await readText(root, 'Makefile')) ?? '');
  }
  const compose = COMPOSE_FILES.find((f) => rootFiles.includes(f));
  if (compose) {
    facts.scripts.hasCompose = true;
    facts.scripts.composeServices = parseComposeServices((await readText(root, compose)) ?? '');
  }
  if (rootFiles.includes('.env.example')) {
    facts.scripts.hasEnvExample = true;
    facts.scripts.envExampleNames = parseEnvExampleNames((await readText(root, '.env.example')) ?? '');
  }
  const readme = rootFiles.find((f) => /^readme(\.md)?$/i.test(f));
  const text = readme ? await readText(root, readme) : null;
  if (text !== null) {
    facts.readme.text = text;
    facts.scripts.readmeCommands = parseReadmeShellCommands(text);
    for (const l of parseReadmeLinks(text)) {
      if (await isFileInside(root, l)) facts.readme.links.push(l);
    }
  }
  return facts;
}
