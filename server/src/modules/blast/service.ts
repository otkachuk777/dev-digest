import type { BlastRadius, PrHistory, GitHubClient } from '@devdigest/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../../db/rows.js';
import { NotFoundError } from '../../platform/errors.js';
import { toBlastRadius, mergePriorPrs } from './helpers.js';
import { HISTORY_MAX_FILES, HISTORY_COMMITS_PER_FILE, HISTORY_MAX_PRS } from './constants.js';

/**
 * blast module. Reads what already exists — `container.repoIntel`'s prebuilt
 * index and `container.reviewRepo`'s persisted PR/repo/files — and maps it to
 * the wire shapes. No reparsing, no LLM. See constants.ts for history limits.
 */
export class BlastService {
  constructor(private container: Container) {}

  private async loadPr(
    workspaceId: string,
    prId: string,
  ): Promise<{ pull: PullRow; repo: { owner: string; name: string }; files: string[] }> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const files = await this.container.reviewRepo.getPrFiles(prId);
    return { pull, repo: { owner: repo.owner, name: repo.name }, files: files.map((f) => f.path) };
  }

  async blast(workspaceId: string, prId: string, log: FastifyBaseLogger): Promise<BlastRadius> {
    const { pull, files } = await this.loadPr(workspaceId, prId);
    const result = await this.container.repoIntel.getBlastRadius(pull.repoId, files);
    const blast = toBlastRadius(result);
    log.info(
      {
        prId,
        repoId: pull.repoId,
        changedFiles: files.length,
        source: result.degraded ? 'fallback' : 'prebuilt-index',
        degraded: !!result.degraded,
        reason: result.reason,
        symbols: blast.changed_symbols.length,
        downstream: blast.downstream.length,
      },
      'blast: read from repo-intel index (no reparse, no LLM)',
    );
    return blast;
  }

  async history(workspaceId: string, prId: string, log: FastifyBaseLogger): Promise<PrHistory> {
    const { pull, repo, files } = await this.loadPr(workspaceId, prId);

    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch (err) {
      log.warn({ err }, 'prior PRs skipped: GitHub unavailable');
      return { history: [] };
    }

    const historyFiles = files.slice(0, HISTORY_MAX_FILES);
    const perFile = await Promise.all(
      historyFiles.map((f) =>
        gh.listMergedPullsForPath(repo, f, HISTORY_COMMITS_PER_FILE).catch(() => []),
      ),
    );
    return { history: mergePriorPrs(historyFiles, perFile, pull.number, HISTORY_MAX_PRS) };
  }
}
