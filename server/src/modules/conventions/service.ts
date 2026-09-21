import type { ConventionCandidate, ConventionScan, UpdateConventionInput } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/index.js';
import { TOP_FILES } from './constants.js';
import { extractConventions } from './extract.js';
import { toCandidateDto, type RepoBasics } from './helpers.js';
import { ConventionsRepository } from './repository.js';

/**
 * Conventions service. `extract` samples the repo (repo-intel + config files, no
 * model), asks the feature's model for candidates, keeps only those whose evidence
 * checks out against the real files, and persists them for review in the UI.
 */
export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoBasics> {
    const repo = await this.repo.repoBasics(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionScan> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const rows = await this.repo.list(workspaceId, repoId);
    const scannedAt = rows.reduce<Date | null>(
      (max, r) => (max && max > r.createdAt ? max : r.createdAt),
      null,
    );
    return {
      items: rows.map((r) => toCandidateDto(r, repo)),
      sample_count: rows[0]?.sampleCount ?? 0,
      scanned_at: scannedAt?.toISOString() ?? null,
    };
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionScan> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const samples = await this.container.repoIntel.getConventionSamples(repoId, TOP_FILES);
    if (!samples.length) {
      throw new ValidationError('Repo is not indexed yet — run reindex in Project Context first');
    }

    const choice = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(choice.provider);
    const ref = { owner: repo.owner, name: repo.name };
    const sha = await this.container.git.currentHead(ref);

    const result = await extractConventions(
      {
        llm,
        model: choice.model,
        readFile: (path) => this.container.git.readFile(ref, path).catch(() => null),
      },
      samples,
    );

    await this.repo.replaceForRepo(
      workspaceId,
      repoId,
      result.candidates.map((c) => ({
        workspaceId,
        repoId,
        category: c.category,
        rule: c.rule,
        evidencePath: c.path,
        evidenceStart: c.startLine,
        evidenceEnd: c.endLine,
        evidenceSnippet: c.snippet,
        evidenceSha: sha,
        confidence: c.confidence,
        accepted: false,
        sampleCount: result.sampleCount,
      })),
    );
    return this.list(workspaceId, repoId);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionInput,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    if (!row?.repoId) return undefined;
    return toCandidateDto(row, await this.requireRepo(workspaceId, row.repoId));
  }

  reject(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.delete(workspaceId, id);
  }
}
