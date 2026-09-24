import { createHash } from 'node:crypto';
import type { PromptSection } from '@devdigest/reviewer-core';

/**
 * Safe, structured description of an assembled prompt for the server log.
 *
 * The record is built from METADATA ONLY — section name, source, size — so it
 * can never carry secrets, diff lines, spec/issue/PR text or model output:
 * no field of it is derived from content except lengths, counts and (verbose)
 * truncated hashes. Content never leaves `sections[].text`, which is read here
 * and dropped.
 *
 * Verbose (PROMPT_LOG_VERBOSE=true, forced off in production) adds per-item
 * sizes, per-file diff sizes and a 12-hex sha256 prefix per section, so two
 * runs' prompts can be compared without reading them.
 */

export type PromptCall = 'intent' | 'review';

export interface PromptLogInput {
  call: PromptCall;
  provider: string;
  model: string;
  /** Groups every prompt of one user action (review batch id / re-derive request). */
  correlationId: string;
  /** Map-reduce chunk label (a file path or "all files"); absent for single-call prompts. */
  chunk?: string;
  sections: PromptSection[];
  countTokens: (text: string) => number;
  verbose: boolean;
}

export interface PromptLogSection {
  name: string;
  source: string;
  chars: number;
  tokens: number;
  sha256?: string;
  items?: { index: number; chars: number; tokens: number }[];
}

export interface PromptLogRecord {
  event: 'prompt.assembled';
  call: PromptCall;
  provider: string;
  model: string;
  correlation_id: string;
  chunk?: string;
  total_chars: number;
  total_tokens: number;
  sections: PromptLogSection[];
  /** Verbose only: per-file sizes of the `diff` section (path from the diff header, no content). */
  diff_files?: { path: string; chars: number; tokens: number; hunks: number }[];
}

const sha12 = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12);

/** Split a unified diff into per-file slices by `diff --git` headers (path taken from ` b/…`). */
function diffFiles(diff: string, countTokens: (t: string) => number): PromptLogRecord['diff_files'] {
  const out: NonNullable<PromptLogRecord['diff_files']> = [];
  const blocks = diff.split(/^(?=diff --git )/m).filter((b) => b.startsWith('diff --git '));
  for (const block of blocks) {
    const header = block.slice(0, block.indexOf('\n') === -1 ? undefined : block.indexOf('\n'));
    const path = header.match(/ b\/(\S+)$/)?.[1] ?? '?';
    out.push({
      path,
      chars: block.length,
      tokens: countTokens(block),
      hunks: (block.match(/^@@ /gm) ?? []).length,
    });
  }
  return out;
}

export function buildPromptLogRecord(input: PromptLogInput): PromptLogRecord {
  const { countTokens, verbose } = input;
  const sections: PromptLogSection[] = input.sections.map((s) => {
    const entry: PromptLogSection = {
      name: s.name,
      source: s.source,
      chars: s.text.length,
      tokens: countTokens(s.text),
    };
    if (verbose) {
      entry.sha256 = sha12(s.text);
      if (s.parts && s.parts.length > 0) {
        entry.items = s.parts.map((p, index) => ({ index, chars: p.length, tokens: countTokens(p) }));
      }
    }
    return entry;
  });

  const record: PromptLogRecord = {
    event: 'prompt.assembled',
    call: input.call,
    provider: input.provider,
    model: input.model,
    correlation_id: input.correlationId,
    ...(input.chunk ? { chunk: input.chunk } : {}),
    total_chars: sections.reduce((n, s) => n + s.chars, 0),
    total_tokens: sections.reduce((n, s) => n + s.tokens, 0),
    sections,
  };

  const diff = input.sections.find((s) => s.name === 'diff');
  if (verbose && diff) record.diff_files = diffFiles(diff.text, countTokens);
  return record;
}

/** One human line for the Live Log, e.g. `prompt: 12.3k tok — system ~410, skills ~184, diff ~9.1k (openrouter/x)`. */
export function promptSummaryLine(r: PromptLogRecord): string {
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const parts = r.sections.map((s) => `${s.name} ~${k(s.tokens)}`).join(', ');
  return `${r.call} prompt: ~${k(r.total_tokens)} tok — ${parts} (${r.provider}/${r.model})`;
}
