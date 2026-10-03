import { stat } from 'node:fs/promises';
import { sep } from 'node:path';
import type { ProjectContextDoc } from '@devdigest/reviewer-core';
import type {
  AgentContext,
  ContextDocFile,
  ContextDocTrace,
  ContextDocType,
  ContextListing,
  SetContextAttachmentsInput,
  SkillContext,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { ContextRepository, type RepoRow } from './repository.js';
import { CONTEXT_BUDGET_TOKENS, TRUNCATED_MARKER } from './constants.js';
import { checkRequestedPath, docTypeFor, mergeAttachments, planBudget } from './helpers.js';
import { readDocSafely, walkDocs, type DocFile } from './docs-fs.js';
import { countDocTokens, docCacheKey, pruneRepo } from './token-cache.js';

export interface SnapshotDoc extends DocFile {
  type: ContextDocType;
  tokens: number;
}

export interface Snapshot {
  root: string;
  /** false when the clone directory does not exist (AC-11). */
  hasClone: boolean;
  docs: SnapshotDoc[];
  byPath: Map<string, SnapshotDoc>;
}

/** What a review run injects from Project Context, plus what its trace records. */
export interface RunContext {
  docs: ProjectContextDoc[];
  /** One entry per attached path (incl. missing); empty when the agent has no attachments. */
  trace: ContextDocTrace[];
  /** Injected paths in prompt order (read + truncated, not missing). */
  specsRead: string[];
  /** Counts only — safe for the prompt log (NFR-4). */
  summary: { docs: number; tokens: number; truncated: number; missing: number };
}

export const EMPTY_RUN_CONTEXT: RunContext = {
  docs: [],
  trace: [],
  specsRead: [],
  summary: { docs: 0, tokens: 0, truncated: 0, missing: 0 },
};

export class ContextService {
  private repo: ContextRepository;

  constructor(private container: Container) {
    this.repo = new ContextRepository(container.db);
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const row = await this.repo.repoInWorkspace(workspaceId, repoId);
    if (!row) throw new NotFoundError('Repository not found');
    return row;
  }

  /** One walk + token count (cached by path/mtime/size) of the repo's clone. */
  async snapshot(repo: RepoRow): Promise<Snapshot> {
    const { container } = this;
    const root = container.git.clonePathFor({ owner: repo.owner, name: repo.name });
    const hasClone = await stat(root).then((s) => s.isDirectory(), () => false);
    if (!hasClone) return { root, hasClone, docs: [], byPath: new Map() };
    const roots = container.config.contextDocs.roots;
    const files = await walkDocs(root, roots);
    const docs: SnapshotDoc[] = [];
    for (const f of files) {
      const tokens = await countDocTokens(container.tokenizer, f, () => readDocSafely(root, f.path));
      docs.push({ ...f, type: docTypeFor(f.path, roots)!, tokens });
    }
    pruneRepo(root + sep, new Set(docs.map(docCacheKey)));
    return { root, hasClone, docs, byPath: new Map(docs.map((d) => [d.path, d])) };
  }

  async listDocs(workspaceId: string, repoId: string): Promise<ContextListing> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const [snap, synced, counts] = await Promise.all([
      this.snapshot(repo),
      this.repo.syncedAt(repo.id),
      this.repo.usedByCounts(workspaceId, repo.id),
    ]);
    return {
      status: snap.hasClone ? 'ok' : 'no_clone',
      glob: this.container.config.contextDocs.glob,
      synced_at: synced ? synced.toISOString() : null,
      total_tokens: snap.docs.reduce((s, d) => s + d.tokens, 0),
      docs: snap.docs.map((d) => ({
        path: d.path,
        type: d.type,
        size: d.size,
        tokens: d.tokens,
        used_by_agents: counts.get(d.path)?.agents ?? 0,
        used_by_skills: counts.get(d.path)?.skills ?? 0,
      })),
    };
  }

  // ------------------------------------------------------------ attachments

  /** Enabled links to enabled, in-workspace skills, in link order, with their stored paths. */
  private async inheritedSkills(workspaceId: string, agentId: string, repoId: string) {
    const links = await this.container.agentsRepo.linkedSkills(workspaceId, agentId);
    const active = links.filter((l) => l.enabled && l.skill.enabled);
    const paths = await this.repo.skillPathsFor(
      workspaceId,
      active.map((l) => l.skill.id),
      repoId,
    );
    return active.map((l) => ({ id: l.skill.id, name: l.skill.name, paths: paths.get(l.skill.id) ?? [] }));
  }

  private async build(
    repo: RepoRow,
    owner: { name: string; paths: string[] },
    skills: { id: string; name: string; paths: string[] }[],
  ): Promise<AgentContext> {
    const snap = await this.snapshot(repo);
    const merged = mergeAttachments(owner, skills);
    const row = (path: string) => {
      const d = snap.byPath.get(path);
      return d
        ? { path, type: d.type, tokens: d.tokens, status: 'present' as const }
        : { path, type: null, tokens: 0, status: 'not_found' as const };
    };
    const attached = merged.filter((m) => m.origin === 'agent').map((m) => row(m.path));
    const inherited = merged
      .filter((m) => m.origin === 'skill')
      .map((m) => ({ ...row(m.path), skill_id: m.skillId!, skill_name: m.originName }));
    const present = merged.flatMap((m) => {
      const d = snap.byPath.get(m.path);
      return d ? [{ path: m.path, tokens: d.tokens }] : [];
    });
    return {
      repo_id: repo.id,
      budget_tokens: CONTEXT_BUDGET_TOKENS,
      attached,
      inherited,
      total_tokens: present.reduce((s, d) => s + d.tokens, 0),
      truncated_paths: planBudget(present, CONTEXT_BUDGET_TOKENS)
        .filter((b) => b.status === 'truncated')
        .map((b) => b.path),
    };
  }

  async getAgentContext(workspaceId: string, agentId: string, repoId: string): Promise<AgentContext> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const repo = await this.requireRepo(workspaceId, repoId);
    const [stored, skills] = await Promise.all([
      this.repo.agentPaths(workspaceId, agentId, repo.id),
      this.inheritedSkills(workspaceId, agentId, repo.id),
    ]);
    return this.build(repo, { name: agent.name, paths: stored }, skills);
  }

  async getSkillContext(workspaceId: string, skillId: string, repoId: string): Promise<SkillContext> {
    const skill = await this.container.skillsRepo.byId(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    const repo = await this.requireRepo(workspaceId, repoId);
    const stored = await this.repo.skillPaths(workspaceId, skillId, repo.id);
    const { inherited: _inherited, ...ctx } = await this.build(repo, { name: skill.name, paths: stored }, []);
    return ctx;
  }

  /** Every new path must be listed now; paths already stored are kept even if they vanished (AC-18, AC-26). */
  private async assertKnown(repo: RepoRow, stored: string[], paths: string[]): Promise<void> {
    const snap = await this.snapshot(repo);
    const keep = new Set(stored);
    const unknown = paths.filter((p) => !snap.byPath.has(p) && !keep.has(p));
    if (unknown.length) throw new AppError('unknown_path', `Unknown document: ${unknown[0]}`, 400, { paths: unknown });
  }

  async setAgentContext(
    workspaceId: string,
    agentId: string,
    body: SetContextAttachmentsInput,
  ): Promise<AgentContext> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const repo = await this.requireRepo(workspaceId, body.repo_id);
    await this.assertKnown(repo, await this.repo.agentPaths(workspaceId, agentId, repo.id), body.paths);
    await this.repo.setAgentPaths(agentId, repo.id, body.paths);
    return this.getAgentContext(workspaceId, agentId, repo.id);
  }

  async setSkillContext(
    workspaceId: string,
    skillId: string,
    body: SetContextAttachmentsInput,
  ): Promise<SkillContext> {
    const skill = await this.container.skillsRepo.byId(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    const repo = await this.requireRepo(workspaceId, body.repo_id);
    await this.assertKnown(repo, await this.repo.skillPaths(workspaceId, skillId, repo.id), body.paths);
    await this.repo.setSkillPaths(skillId, repo.id, body.paths);
    return this.getSkillContext(workspaceId, skillId, repo.id);
  }

  /**
   * The docs a review run injects: the agent's paths for this repo, then each enabled
   * linked skill's, deduped (AC-28/29/37). Read from the clone at run time (AC-40);
   * an unreadable doc is skipped with a `warn` line naming only its path (AC-33).
   * No LLM calls (NFR-2).
   */
  async resolveForRun(
    workspaceId: string,
    agent: { id: string; name: string },
    repo: RepoRow,
    log: { warn(msg: string): void },
  ): Promise<RunContext> {
    const [stored, skills] = await Promise.all([
      this.repo.agentPaths(workspaceId, agent.id, repo.id),
      this.inheritedSkills(workspaceId, agent.id, repo.id),
    ]);
    const merged = mergeAttachments({ name: agent.name, paths: stored }, skills);
    if (merged.length === 0) return EMPTY_RUN_CONTEXT;

    const { tokenizer, git } = this.container;
    const root = git.clonePathFor({ owner: repo.owner, name: repo.name });
    const read: { m: (typeof merged)[number]; content: string; tokens: number }[] = [];
    const missing = new Set<string>();
    for (const m of merged) {
      try {
        const content = await readDocSafely(root, m.path);
        read.push({ m, content, tokens: tokenizer.count(content) });
      } catch {
        missing.add(m.path);
        log.warn(`Project context: skipped missing or unreadable doc ${m.path}`);
      }
    }

    const plan = planBudget(read.map((r) => ({ path: r.m.path, tokens: r.tokens })), CONTEXT_BUDGET_TOKENS);
    const docs: ProjectContextDoc[] = [];
    const kept = new Map<string, { tokens: number; status: 'read' | 'truncated' }>();
    read.forEach((r, i) => {
      const { keepTokens, status } = plan[i]!;
      const text =
        status === 'read'
          ? r.content
          : keepTokens > 0
            ? `${tokenizer.truncate(r.content, keepTokens)}\n${TRUNCATED_MARKER}`
            : TRUNCATED_MARKER;
      docs.push({ path: r.m.path, text });
      kept.set(r.m.path, { tokens: status === 'read' ? r.tokens : keepTokens, status });
    });

    const trace: ContextDocTrace[] = merged.map((m) => ({
      path: m.path,
      origin: m.origin,
      origin_name: m.originName,
      ...(missing.has(m.path) ? { tokens: 0, status: 'missing' as const } : kept.get(m.path)!),
    }));
    return {
      docs,
      trace,
      specsRead: docs.map((d) => d.path),
      summary: {
        docs: docs.length,
        tokens: trace.reduce((s, c) => s + c.tokens, 0),
        truncated: trace.filter((c) => c.status === 'truncated').length,
        missing: missing.size,
      },
    };
  }

  async getDoc(workspaceId: string, repoId: string, path: string): Promise<ContextDocFile> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (checkRequestedPath(path) !== 'ok') throw new AppError('invalid_path', 'Invalid path', 400);
    const notFound = () => new AppError('context_doc_not_found', 'Document not found', 404);
    const snap = await this.snapshot(repo);
    const doc = snap.byPath.get(path);
    if (!doc) throw notFound();
    const content = await readDocSafely(snap.root, path).catch(() => {
      throw notFound();
    });
    const counts = await this.repo.usedByCounts(workspaceId, repo.id);
    return {
      path: doc.path,
      type: doc.type,
      tokens: doc.tokens,
      used_by_agents: counts.get(path)?.agents ?? 0,
      used_by_skills: counts.get(path)?.skills ?? 0,
      content,
    };
  }
}
