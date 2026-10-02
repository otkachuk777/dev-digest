import type {
  Onboarding,
  OnboardingNote,
  OnboardingStatus,
} from '@devdigest/shared';
import { isJunkPath, type RepoFacts } from '../repo-intel/index.js';
import { CHAIN_MAX, CRITICAL_MAX, CRITICAL_ROOTS, GENERATED_PATH_PATTERNS, HOW_TO_RUN_MAX, READING_PATH_MAX } from './constants.js';

export type ReadingPathItem = Onboarding['reading_path'][number];
export type CriticalPathItem = Onboarding['critical_paths'][number];
export type HowToRunItem = Onboarding['how_to_run'][number];
export type TourSections = Pick<
  Onboarding,
  'architecture' | 'critical_paths' | 'how_to_run' | 'reading_path' | 'first_tasks'
>;

export interface RankedFile {
  path: string;
  pagerank: number;
  hotness: number;
  /** pagerank × (1 + hotness) */
  rank: number;
  percentile: number;
  importedBy: number;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const norm = (s: string) => s.trim().replace(/\s+/g, ' ');

/** null, "", "." and "./" all mean the repo root. */
export function normalizeCwd(cwd: string | null): string | null {
  const c = (cwd ?? '').trim().replace(/^\.\//, '').replace(/\/+$/, '');
  return c === '' || c === '.' ? null : c;
}

const excluded = (p: string) =>
  isJunkPath(p) || GENERATED_PATH_PATTERNS.some((g) => p.toLowerCase().includes(g));

/** rank desc, path asc. */
export function rankFiles(facts: RepoFacts, hotness: Record<string, number>): RankedFile[] {
  return facts.graph.files
    .map((f) => {
      const h = hotness[f.path] ?? 0;
      return { path: f.path, pagerank: f.pagerank, hotness: h, rank: f.pagerank * (1 + h), percentile: f.percentile, importedBy: f.importedBy };
    })
    .sort((a, b) => b.rank - a.rank || cmp(a.path, b.path));
}

/** AC-31 fallback: README links → entry points → root files, deduped, filtered, cut. */
function fallbackPaths(facts: RepoFacts, max: number): string[] {
  const all = [...facts.readme.links, ...facts.entryPoints, ...facts.rootFiles];
  return [...new Set(all)].filter((p) => !excluded(p)).slice(0, max);
}

export function selectReadingPath(
  facts: RepoFacts,
  hotness: Record<string, number>,
): ReadingPathItem[] {
  if (facts.graph.edges.length === 0) {
    return fallbackPaths(facts, READING_PATH_MAX).map((path) => ({
      path,
      reason: 'Rank percentile 0',
      rank: 0,
      hotness: 0,
    }));
  }
  return rankFiles(facts, hotness)
    .filter((f) => !excluded(f.path))
    .slice(0, READING_PATH_MAX)
    .map((f) => ({ path: f.path, reason: `Rank percentile ${f.percentile}`, rank: f.rank, hotness: f.hotness }));
}

export function selectCriticalPaths(
  facts: RepoFacts,
  hotness: Record<string, number>,
): CriticalPathItem[] {
  const importedBy = new Map(facts.graph.files.map((f) => [f.path, f.importedBy]));
  const reason = (path: string) => `Imported by ${importedBy.get(path) ?? 0} indexed files`;
  if (facts.graph.edges.length === 0) {
    return fallbackPaths(facts, CRITICAL_MAX).map((path) => ({ path, reason: reason(path) }));
  }
  const ranked = rankFiles(facts, hotness).filter((f) => !excluded(f.path));
  const order = new Map(ranked.map((f, i) => [f.path, i]));
  const out = new Set<string>();
  for (const root of ranked.slice(0, CRITICAL_ROOTS)) {
    const chain = [root.path];
    while (chain.length < CHAIN_MAX) {
      const next = facts.graph.edges
        .filter((e) => e.from === chain[chain.length - 1] && order.has(e.to) && !chain.includes(e.to))
        .sort((a, b) => order.get(a.to)! - order.get(b.to)!)[0];
      if (!next) break;
      chain.push(next.to);
    }
    chain.forEach((p) => out.add(p));
  }
  return [...out].slice(0, CRITICAL_MAX).map((path) => ({ path, reason: reason(path) }));
}

/** Fixed order: index_partial|index_degraded, graph_unavailable, hotness_unavailable, files_bounded. */
export function tourNotes(facts: RepoFacts, hotnessAvailable: boolean): OnboardingNote[] {
  const notes: OnboardingNote[] = [];
  if (facts.indexStatus === 'partial') notes.push('index_partial');
  else if (facts.indexStatus !== 'full') notes.push('index_degraded');
  if (facts.graph.edges.length === 0) notes.push('graph_unavailable');
  if (!hotnessAvailable) notes.push('hotness_unavailable');
  if (facts.filesBounded) notes.push('files_bounded');
  return notes;
}

export function tourStatus(llmSucceeded: boolean, notes: OnboardingNote[]): OnboardingStatus {
  if (!llmSucceeded) return 'skeleton';
  return notes.length ? 'partial' : 'full';
}

/** Returns the canonical cwd (null = root) when the command is a facts-derived candidate, else false. */
export function isCandidateCommand(
  facts: RepoFacts,
  command: string,
  cwd: string | null,
): string | null | false {
  const cmd = norm(command);
  const dir = normalizeCwd(cwd);
  const { scripts, stack } = facts;
  const pm = stack.packageManager;
  const ok = (v: boolean) => (v ? dir : false);

  if (pm && cmd === `${pm} install`) {
    return ok(dir === null || scripts.manifests.some((m) => m.dir === dir));
  }
  const eff = pm ?? 'npm';
  const manifest = scripts.manifests.find((m) => m.dir === dir);
  for (const s of manifest?.scripts ?? []) {
    const forms = [`${eff} run ${s}`];
    if (eff === 'npm' ? s === 'test' || s === 'start' : true) forms.push(`${eff} ${s}`);
    if (forms.includes(cmd)) return dir;
  }
  if (dir !== null) return false;
  if (scripts.makeTargets.some((t) => cmd === `make ${t}`)) return null;
  if (scripts.hasEnvExample && cmd === 'cp .env.example .env') return null;
  if (scripts.hasCompose && cmd.startsWith('docker compose up -d')) {
    const rest = cmd.slice('docker compose up -d'.length).trim();
    if (!rest || rest.split(' ').every((s) => scripts.composeServices.includes(s))) return null;
  }
  return scripts.readmeCommands.some((c) => norm(c) === cmd) ? null : false;
}

export function skeletonCommands(facts: RepoFacts): HowToRunItem[] {
  const { scripts, stack } = facts;
  const pm = stack.packageManager;
  const out: HowToRunItem[] = [];
  if (pm) {
    const root = scripts.manifests.find((m) => m.dir === null) ?? scripts.manifests[0];
    out.push({ command: `${pm} install`, comment: null, cwd: root?.dir ?? null });
  }
  for (const s of ['dev', 'start', 'build', 'test']) {
    const m = scripts.manifests.find((x) => x.scripts.includes(s));
    if (m) out.push({ command: `${pm ?? 'npm'} run ${s}`, comment: null, cwd: m.dir });
  }
  if (scripts.hasCompose) out.push({ command: 'docker compose up -d', comment: null, cwd: null });
  return out.slice(0, HOW_TO_RUN_MAX);
}

export function buildSkeletonSections(
  facts: RepoFacts,
  hotness: Record<string, number>,
): TourSections {
  const { stack, structure, routes } = facts;
  const langs = stack.languages.map((l) => `${l.ext} (${l.files})`).join(', ') || 'unknown';
  const stackLine = [langs, stack.packageManager, ...stack.frameworks].filter(Boolean).join(', ');
  const dirs = structure.map((d) => `${d.dir} (${d.files})`).join(', ') || 'n/a';
  return {
    architecture: {
      body: [
        `- **Stack:** ${stackLine}`,
        `- **Structure:** ${dirs}`,
        `- **Routes:** ${routes.length} HTTP endpoints`,
      ].join('\n'),
      diagram: null,
    },
    critical_paths: selectCriticalPaths(facts, hotness),
    how_to_run: skeletonCommands(facts),
    reading_path: selectReadingPath(facts, hotness),
    first_tasks: [],
  };
}
