import { z } from 'zod';
import type { LLMProvider } from '@devdigest/shared';
import { ExternalServiceError } from '../../platform/errors.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import { renderPrompt } from '../../platform/prompts.js';
import {
  CONFIG_PATHS,
  EXTRACT_TIMEOUT_MS,
  MAX_CANDIDATES,
  MAX_FILE_CHARS,
  MIN_CONFIDENCE,
} from './constants.js';
import { verifyEvidence } from './evidence.js';

const ExtractionSchema = z.object({
  candidates: z.array(
    z.object({
      category: z.string(),
      rule: z.string(),
      confidence: z.number(),
      evidence: z.object({
        path: z.string(),
        start_line: z.number(),
        end_line: z.number(),
        snippet: z.string(),
      }),
    }),
  ),
});

export interface ExtractDeps {
  llm: LLMProvider;
  model: string;
  /** File content at the scanned commit, or null when the file does not exist. */
  readFile(path: string): Promise<string | null>;
  /** Hard cap on the model call (default EXTRACT_TIMEOUT_MS). */
  timeoutMs?: number;
}

export interface ExtractedCandidate {
  category: string;
  rule: string;
  confidence: number;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
}

export type Rejection = 'path-not-sampled' | 'low-confidence' | 'duplicate' | 'snippet-not-found' | 'over-limit';

export interface ExtractResult {
  candidates: ExtractedCandidate[];
  sampleCount: number;
  /** Candidates the model returned that failed the evidence/quality checks. */
  dropped: number;
  /** Why each dropped candidate was dropped — for logs and the quality report. */
  rejections: { rule: string; path: string; reason: Rejection }[];
  costUsd: number | null;
}

/** Prefix every line with its number so the model can cite lines; cut on a line boundary. */
export function numberLines(text: string): string {
  const out: string[] = [];
  let used = 0;
  for (const [i, line] of text.split('\n').entries()) {
    const row = `${String(i + 1).padStart(4)}| ${line}`;
    used += row.length + 1;
    if (used > MAX_FILE_CHARS) break;
    out.push(row);
  }
  return out.join('\n');
}

/**
 * Sample files → one structured model call → keep only candidates whose evidence
 * survives a code check. Nothing the model says about a file is trusted: the path
 * must be one we sent, and the snippet must exist in the real file (see evidence.ts).
 */
export async function extractConventions(
  deps: ExtractDeps,
  samplePaths: string[],
): Promise<ExtractResult> {
  const files = new Map<string, string>();
  for (const path of [...new Set([...CONFIG_PATHS, ...samplePaths])]) {
    const text = await deps.readFile(path);
    // An empty file has nothing to learn from (and adapters may return '' for a missing one).
    if (text?.trim()) files.set(path, text);
  }

  const system = await renderPrompt('conventions.system.md', { max: String(MAX_CANDIDATES) });
  const user = [...files].map(([path, text]) => wrapUntrusted(`file:${path}`, numberLines(text)));

  // The provider's own timeout is per HTTP attempt and it retries, so a slow model
  // (the default here is a free reasoning model) can hold the request for minutes.
  // Bound the whole call; the abandoned request finishes harmlessly in the background.
  const limit = deps.timeoutMs ?? EXTRACT_TIMEOUT_MS;
  let timer: NodeJS.Timeout | undefined;
  const res = await Promise.race([
    deps.llm.completeStructured({
      model: deps.model,
      schema: ExtractionSchema,
      schemaName: 'ConventionExtraction',
      temperature: 0,
      timeoutMs: limit,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user.join('\n\n') },
      ],
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new ExternalServiceError(`The model did not answer within ${Math.round(limit / 1000)}s`)),
        limit,
      );
    }),
  ]).finally(() => clearTimeout(timer));

  const seen = new Set<string>();
  const kept: ExtractedCandidate[] = [];
  const rejections: ExtractResult['rejections'] = [];
  for (const c of res.data.candidates) {
    const reject = (reason: Rejection) => rejections.push({ rule: c.rule, path: c.evidence.path, reason });
    const text = files.get(c.evidence.path);
    if (text === undefined) {
      reject('path-not-sampled');
      continue;
    }
    if (c.confidence < MIN_CONFIDENCE) {
      reject('low-confidence');
      continue;
    }
    const key = c.rule.trim().toLowerCase();
    if (seen.has(key)) {
      reject('duplicate');
      continue;
    }
    const found = verifyEvidence(text, { snippet: c.evidence.snippet, startLine: c.evidence.start_line });
    if (!found) {
      reject('snippet-not-found');
      continue;
    }
    seen.add(key);
    kept.push({
      category: c.category,
      rule: c.rule.trim(),
      confidence: Math.min(1, c.confidence),
      path: c.evidence.path,
      ...found,
    });
  }

  const candidates = kept.slice(0, MAX_CANDIDATES);
  for (const c of kept.slice(MAX_CANDIDATES)) rejections.push({ rule: c.rule, path: c.path, reason: 'over-limit' });
  return {
    candidates,
    sampleCount: files.size,
    dropped: res.data.candidates.length - candidates.length,
    rejections,
    costUsd: res.costUsd,
  };
}
