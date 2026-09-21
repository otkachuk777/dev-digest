import { z } from 'zod';
import type { LLMProvider } from '@devdigest/shared';
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

export interface ExtractResult {
  candidates: ExtractedCandidate[];
  sampleCount: number;
  /** Candidates the model returned that failed the evidence/quality checks. */
  dropped: number;
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
    if (text !== null) files.set(path, text);
  }

  const system = await renderPrompt('conventions.system.md', { max: String(MAX_CANDIDATES) });
  const user = [...files].map(([path, text]) => wrapUntrusted(`file:${path}`, numberLines(text)));

  const res = await deps.llm.completeStructured({
    model: deps.model,
    schema: ExtractionSchema,
    schemaName: 'ConventionExtraction',
    temperature: 0,
    timeoutMs: EXTRACT_TIMEOUT_MS,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user.join('\n\n') },
    ],
  });

  const seen = new Set<string>();
  const kept: ExtractedCandidate[] = [];
  for (const c of res.data.candidates) {
    const text = files.get(c.evidence.path);
    if (text === undefined || c.confidence < MIN_CONFIDENCE) continue;
    const key = c.rule.trim().toLowerCase();
    if (seen.has(key)) continue;
    const found = verifyEvidence(text, { snippet: c.evidence.snippet, startLine: c.evidence.start_line });
    if (!found) continue;
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
  return {
    candidates,
    sampleCount: files.size,
    dropped: res.data.candidates.length - candidates.length,
    costUsd: res.costUsd,
  };
}
