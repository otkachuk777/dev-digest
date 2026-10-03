import { z } from 'zod';
import type { ChatMessage } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from './prompt.js';

/**
 * PR Brief — prompt assembly for the one `risk_brief` model call. Pure module:
 * it receives facts the server already collected and a tokenizer it defines the
 * shape of (a port); it never sees a diff body — only `@@` hunk headers.
 */

// ---- Model output (raw) ----------------------------------------------------

/**
 * No `.max()` and a free-string `kind` on purpose (as `IntentModelOutput`): the
 * server enforces caps and maps an unknown kind to `other` while grounding.
 */
export const BriefModelOutput = z.object({
  summary: z.string(),
  risks: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      explanation: z.string(),
      severity: z.enum(['high', 'medium', 'low']),
      file_refs: z.array(z.string()),
    }),
  ),
  review_focus: z.array(
    z.object({
      file: z.string(),
      line: z.number().int(),
      reason: z.string(),
    }),
  ),
});
export type BriefModelOutput = z.infer<typeof BriefModelOutput>;

// ---- Hunks (the only place that may see the diff) --------------------------

export interface BriefHunk {
  start: number;
  length: number;
  header: string;
}

const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;
const MAX_HEADER_CHARS = 160;

/**
 * Read ONLY `@@ … @@` lines of a patch; body lines (`+`/`-`/context) are never
 * stored. This is the mechanical guarantee that diff bodies stay out of the prompt.
 */
export function parseHunks(patch: string | null): BriefHunk[] {
  if (!patch) return [];
  const hunks: BriefHunk[] = [];
  for (const line of patch.split('\n')) {
    if (!line.startsWith('@@')) continue;
    const m = HUNK_RE.exec(line);
    if (!m) continue;
    hunks.push({
      start: Number(m[1]),
      length: m[2] === undefined ? 1 : Number(m[2]),
      header: (m[3] ?? '').trim().slice(0, MAX_HEADER_CHARS),
    });
  }
  return hunks;
}

// ---- Facts ------------------------------------------------------------------

/** reviewer-core's own port: the server's tokenizer satisfies it structurally. */
export interface BriefTokenizer {
  count(s: string): number;
  truncate(s: string, n: number): string;
}

export interface BriefFileFacts {
  path: string;
  additions: number;
  deletions: number;
  role: string;
  hunks: BriefHunk[];
  symbols: string[];
  findings: { severity: string; title: string; line: number }[];
}

export interface BriefFacts {
  title: string;
  description: string | null;
  intent: { summary: string; in_scope: string[]; out_of_scope: string[] } | null;
  /** In EC-12 order; the budget loop removes from the end. */
  files: BriefFileFacts[];
  blast: {
    callers: { file: string; line: number; name: string }[];
    endpoints: string[];
    crons: string[];
  } | null;
  issue: { title: string; body: string | null } | null;
  specDocPaths: string[];
}

export const BRIEF_MAX_INPUT_TOKENS = 8000;
export const BRIEF_DESCRIPTION_TOKENS = 1500;
export const BRIEF_ISSUE_TOKENS = 1000;
/** Bound on the facts the server stores as the intent/blast snapshot (NFR-5). */
export const BRIEF_MAX_FACT_BYTES = 40_000;

const BRIEF_SYSTEM =
  'You write a PR Brief for a code reviewer: a short summary of why this pull request exists, ' +
  'the risks of merging it, and where the reviewer should look first. Use ONLY the facts ' +
  'provided below — never invent paths, lines, tickets or requirements.\n' +
  `${INJECTION_GUARD}\n` +
  'Cite only file paths listed under the files block. A review-focus line must lie inside a ' +
  'listed hunk range (start-end) of that file, or on a listed caller line. A risk file_ref is ' +
  'a listed path, optionally `path:line` or `path:start-end`. Each risk has a kind: ' +
  'security, db_migration, breaking_api, perf, deps or other.\n' +
  'Return at most 6 risks and at most 8 review-focus items. Answer with JSON only.';

export interface BriefPrompt {
  messages: ChatMessage[];
  inputTokens: number;
  truncated: boolean;
  /** Exactly the facts that ended up in the prompt (basis of the stored snapshot). */
  sent: BriefFacts;
}

function renderFile(f: BriefFileFacts): string {
  const lines = [`${f.path} [${f.role}] +${f.additions} -${f.deletions}`];
  for (const h of f.hunks) {
    lines.push(`  ${h.start}-${h.start + Math.max(h.length, 1) - 1} @@ ${h.header}`);
  }
  if (f.symbols.length > 0) lines.push(`  changed symbols: ${f.symbols.join(', ')}`);
  for (const x of f.findings) lines.push(`  finding [${x.severity}] line ${x.line}: ${x.title}`);
  return lines.join('\n');
}

function render(facts: BriefFacts, callerCount: number): string {
  const parts: string[] = [`## PR title\n${wrapUntrusted('pr-title', facts.title)}`];
  if (facts.description) {
    parts.push(`## PR description\n${wrapUntrusted('pr-description', facts.description)}`);
  }
  if (facts.intent) {
    const i = facts.intent;
    const list = (xs: string[]) => (xs.length ? xs.map((s) => `- ${s}`).join('\n') : '- (none)');
    parts.push(
      `## Derived intent\n${wrapUntrusted(
        'intent',
        `${i.summary}\nIn scope:\n${list(i.in_scope)}\nOut of scope:\n${list(i.out_of_scope)}`,
      )}`,
    );
  }
  parts.push(
    `## Changed files (hunk ranges only — no diff bodies)\n${wrapUntrusted('files', facts.files.map(renderFile).join('\n\n'))}`,
  );
  if (facts.blast) {
    const b = facts.blast;
    const lines = [
      `${callerCount} callers, ${b.endpoints.length} endpoints affected, ${b.crons.length} cron jobs affected`,
      ...b.callers.map((c) => `${c.file}:${c.line} ${c.name}`),
    ];
    parts.push(`## Blast radius\n${wrapUntrusted('blast', lines.join('\n'))}`);
  }
  if (facts.issue) {
    const body = facts.issue.body ? `\n${facts.issue.body}` : '';
    parts.push(`## Linked issue\n${wrapUntrusted('issue', facts.issue.title + body)}`);
  }
  if (facts.specDocPaths.length > 0) {
    parts.push(`## Spec / doc files in the PR\n${wrapUntrusted('spec-docs', facts.specDocPaths.join('\n'))}`);
  }
  return parts.join('\n\n');
}

/**
 * Build the single brief prompt within `BRIEF_MAX_INPUT_TOKENS` (and the fact-byte
 * bound). Over budget, facts are removed in a fixed order: spec/doc paths, the
 * issue body (its title stays), the caller list (counts stay), then files from
 * the end. A file takes its symbols and findings with it.
 */
export function buildBriefPrompt(input: BriefFacts, tokenizer: BriefTokenizer): BriefPrompt {
  const cur: BriefFacts = {
    ...input,
    description: input.description
      ? tokenizer.truncate(input.description, BRIEF_DESCRIPTION_TOKENS)
      : input.description,
    issue: input.issue
      ? {
          title: input.issue.title,
          body: input.issue.body ? tokenizer.truncate(input.issue.body, BRIEF_ISSUE_TOKENS) : input.issue.body,
        }
      : null,
    files: [...input.files],
    blast: input.blast ? { ...input.blast, callers: [...input.blast.callers] } : null,
    specDocPaths: [...input.specDocPaths],
  };
  const callerCount = input.blast?.callers.length ?? 0;
  let truncated = false;

  const build = (): { messages: ChatMessage[]; tokens: number } => {
    const user = render(cur, callerCount);
    return {
      messages: [
        { role: 'system', content: BRIEF_SYSTEM },
        { role: 'user', content: user },
      ],
      tokens: tokenizer.count(BRIEF_SYSTEM + user),
    };
  };
  const over = (tokens: number) =>
    tokens > BRIEF_MAX_INPUT_TOKENS || JSON.stringify(cur).length > BRIEF_MAX_FACT_BYTES;

  // ponytail: linear re-render per removal (<= ~100 files); binary search if it gets slow.
  let built = build();
  while (over(built.tokens)) {
    if (cur.specDocPaths.length > 0) cur.specDocPaths = [];
    else if (cur.issue?.body) cur.issue = { title: cur.issue.title, body: null };
    else if (cur.blast && cur.blast.callers.length > 0) cur.blast = { ...cur.blast, callers: [] };
    else if (cur.files.length > 0) cur.files.pop();
    else break;
    truncated = true;
    built = build();
  }

  return { messages: built.messages, inputTokens: built.tokens, truncated, sent: cur };
}
