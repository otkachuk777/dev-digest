import type { RepoRef, UnifiedDiff, PrIntentRecord, IntentSource, IntentSourceKind } from '@devdigest/shared';
import { IntentModelOutput, clampIntentOutput, deriveConfidence, buildIntentPrompt, type IntentDoc } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import type { RunLogger } from '../../platform/run-logger.js';
import { AppError, ExternalServiceError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/index.js';
import type { ReviewRepository, PullRow } from './repository.js';
import { toIntentRecord, extractIntentLinks } from './helpers.js';
import { INTENT_TIMEOUT_MS, MAX_INTENT_SOURCES } from './constants.js';
import { buildPromptLogRecord } from './prompt-log.js';

/**
 * Derive a PR's intent: resolve the feature model, gather sources (title,
 * description, GitHub-only issue/plan-file links, hunk headers), run the
 * classifier under a hard timeout, clamp its output, compute confidence
 * deterministically, persist, and return the record.
 *
 * Any failure (missing key, GitHub error, timeout) is the CALLER's concern —
 * this throws, and `run-executor.ts` logs it as `info` and continues the
 * review without an intent (never fails the run).
 */
export async function deriveIntent(params: {
  container: Container;
  repo: ReviewRepository;
  workspaceId: string;
  pull: PullRow;
  repoRef: RepoRef;
  diff: UnifiedDiff;
  log: RunLogger;
  /** Groups this call with the rest of the user action (review batch / re-derive request). */
  correlationId: string;
}): Promise<PrIntentRecord> {
  const { container, repo, workspaceId, pull, repoRef, diff, log, correlationId } = params;
  const start = Date.now();
  log.tool('Deriving PR intent…');

  const { provider, model } = await resolveFeatureModel(container, workspaceId, 'review_intent');
  log.info(`intent: model ${provider}/${model}`);

  const links = extractIntentLinks(pull.body, repoRef, pull.number);

  const sources: IntentSource[] = [{ kind: 'title', ref: 'pr-title', status: 'used' }];
  const description =
    pull.body && pull.body.trim().length > 0 ? pull.body.slice(0, 4000) : undefined;
  if (description) sources.push({ kind: 'description', ref: 'pr-description', status: 'used' });

  let github: Awaited<ReturnType<Container['github']>> | undefined;
  try {
    github = await container.github();
  } catch {
    github = undefined;
  }

  const docs: IntentDoc[] = [];
  for (const link of links) {
    // Reserve the last slot for the `files` source pushed after the loop.
    if (sources.length >= MAX_INTENT_SOURCES - 1) break;

    if (link.kind === 'issue' && github) {
      try {
        const issue = await github.getIssue(repoRef, link.number!);
        docs.push({ label: `issue:${link.ref}`, content: `${issue.title}\n\n${issue.body ?? ''}`.slice(0, 8000) });
        sources.push({ kind: 'issue', ref: link.ref, status: 'used' });
      } catch {
        sources.push({ kind: 'issue', ref: link.ref, status: 'unavailable' });
      }
      continue;
    }
    if (link.kind === 'plan_file' && github) {
      try {
        const content = await github.getFileContent(repoRef, link.path!, pull.headSha);
        if (content == null) throw new Error('not found');
        docs.push({ label: `plan_file:${link.ref}`, content: content.slice(0, 8000) });
        sources.push({ kind: 'plan_file', ref: link.ref, status: 'used' });
      } catch {
        sources.push({ kind: 'plan_file', ref: link.ref, status: 'unavailable' });
      }
      continue;
    }
    if (link.kind === 'issue' || link.kind === 'plan_file') {
      // GitHub unreachable entirely (no token / getFileContent add-on failed to build client).
      sources.push({ kind: link.kind, ref: link.ref, status: 'unavailable' });
      continue;
    }
    // external — never fetched (Jira, Notion, other domains/repos). Attributed
    // to the source kind it superficially resembles, purely for the log/UI.
    const externalKind: IntentSourceKind = link.ref.endsWith('.md') ? 'plan_file' : 'issue';
    sources.push({ kind: externalKind, ref: link.ref, status: 'unavailable' });
  }

  sources.push({ kind: 'files', ref: 'changed-files', status: 'used' });
  const cappedSources = sources.slice(0, MAX_INTENT_SOURCES);

  log.info(
    `intent: sources — ${cappedSources.map((s) => `${s.kind} ${s.ref} ${s.status}`).join('; ')}`,
  );

  const { messages, sections, filesCount, hunkCount } = buildIntentPrompt({
    title: pull.title.slice(0, 300),
    description,
    docs,
    diff,
  });

  const rec = buildPromptLogRecord({
    call: 'intent',
    provider,
    model,
    correlationId,
    sections,
    countTokens: (t) => container.tokenizer.count(t),
    verbose: container.config.promptLogVerbose,
  });
  log.record('prompt.assembled', { ...rec });
  const tokLine = rec.sections.map((s) => `${s.name} ~${s.tokens} tok`).join(', ');
  log.info(
    `intent: prompt — ${tokLine} (${filesCount} files, ${hunkCount} hunk headers; no diff bodies)`,
  );

  const sessionId = `${repoRef.owner}/${repoRef.name}#${pull.number}:intent`;

  let timer: NodeJS.Timeout | undefined;
  const res = await Promise.race([
    container.llm(provider).then((llm) =>
      llm.completeStructured({
        model,
        schema: IntentModelOutput,
        schemaName: 'PrIntent',
        temperature: 0,
        messages,
        sessionId,
      }),
    ).catch((err: unknown) => {
      // A raw SDK/HTTP/schema error is the upstream model's failure → 502. App
      // errors (e.g. ConfigError for a missing key) keep their own status.
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(`Intent model call failed: ${(err as Error).message}`);
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new ExternalServiceError(`The intent model did not answer within ${Math.round(INTENT_TIMEOUT_MS / 1000)}s`)),
        INTENT_TIMEOUT_MS,
      );
    }),
  ]).finally(() => clearTimeout(timer));

  const clamped = clampIntentOutput(res.data);
  const confidence = deriveConfidence(cappedSources);

  await repo.upsertIntent(pull.id, {
    summary: clamped.summary,
    inScope: clamped.in_scope,
    outOfScope: clamped.out_of_scope,
    headSha: pull.headSha,
    model,
    confidence,
    sources: cappedSources,
    missingContext: clamped.missing_context,
  });

  const row = await repo.getIntent(pull.id);
  if (!row) throw new ExternalServiceError('Intent was not persisted');

  log.result(
    `Deriving PR intent done (${Date.now() - start}ms) — confidence ${confidence}, ` +
      `${clamped.in_scope.length} in scope / ${clamped.out_of_scope.length} out of scope, ` +
      `cost $${(res.costUsd ?? 0).toFixed(4)}`,
  );

  return toIntentRecord(row);
}
