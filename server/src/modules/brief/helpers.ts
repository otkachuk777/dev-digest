import { RiskKind, type BlastRadius, type PrBrief } from '@devdigest/shared';
import type { BriefFacts, BriefHunk, BriefModelOutput } from '@devdigest/reviewer-core';
import { isSafeRepoPath } from '../onboarding/index.js';
import {
  BRIEF_ROLE_ORDER, EXPLANATION_MAX, FINDINGS_MAX, FOCUS_MAX, REASON_MAX, RISKS_MAX,
  SEVERITY_ORDER, SPEC_DOC_DIRS, SUMMARY_MAX, TITLE_MAX,
} from './constants.js';

const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);

/** Cap a string without leaving half an emoji: a lone surrogate makes Postgres jsonb reject the row (22P02). */
function cut(s: string, max: number): string {
  const c = s.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(c) && s.length > max ? c.slice(0, -1) : c;
}

/** EC-12: role (core, wiring, tests, docs, boilerplate), then additions + deletions descending, then path. */
export function orderFiles<T extends { path: string; additions: number; deletions: number; role: string }>(files: T[]): T[] {
  const rank = (role: string) => {
    const i = (BRIEF_ROLE_ORDER as readonly string[]).indexOf(role);
    return i === -1 ? BRIEF_ROLE_ORDER.length : i;
  };
  return [...files].sort(
    (a, b) =>
      rank(a.role) - rank(b.role) ||
      b.additions + b.deletions - (a.additions + a.deletions) ||
      cmp(a.path, b.path),
  );
}

/** AC-28: `.md` files with a directory segment in `specs`, `docs` or `insights`. */
export function specDocPaths(paths: string[]): string[] {
  return paths.filter(
    (p) =>
      p.toLowerCase().endsWith('.md') &&
      p.split('/').slice(0, -1).some((d) => (SPEC_DOC_DIRS as readonly string[]).includes(d)),
  );
}

/** OQ-2: severity (CRITICAL first), then file, then line; at most 30. */
export function selectFindings<T extends { severity: string; file: string; startLine: number }>(rows: T[]): T[] {
  const rank = (s: string) => {
    const i = (SEVERITY_ORDER as readonly string[]).indexOf(s);
    return i === -1 ? SEVERITY_ORDER.length : i;
  };
  return [...rows]
    .sort((a, b) => rank(a.severity) - rank(b.severity) || cmp(a.file, b.file) || a.startLine - b.startLine)
    .slice(0, FINDINGS_MAX);
}

/**
 * AC-37: the stored blast snapshot is the original blast projected onto what was sent —
 * symbols of the sent files, downstream only when the caller list was sent. The summary
 * (the counts) is kept as computed from the full blast.
 */
export function blastSnapshot(blast: BlastRadius, sent: BriefFacts): BlastRadius {
  const paths = new Set(sent.files.map((f) => f.path));
  const callersSent = (sent.blast?.callers.length ?? 0) > 0;
  return {
    ...blast,
    changed_symbols: blast.changed_symbols.filter((c) => paths.has(c.file)),
    downstream: callersSent ? blast.downstream : [],
  };
}

export interface GroundingScope {
  /** PR file → new-side hunk ranges. */
  prFiles: Map<string, BriefHunk[]>;
  /** Blast caller file → caller lines that were sent. */
  blastCallers: Map<string, Set<number>>;
}

const REF_RE = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/;

/**
 * Model output → stored shape (AC-38..42, 56..58). Untrusted: every path must be safe and
 * known, every line must be inside a hunk (or on a sent caller line), strings are cut,
 * lists are capped. `dropped` counts dropped focus items, dropped risks and the excess
 * past the caps; an individual bad ref only counts when it empties its risk.
 */
export function groundBrief(
  out: BriefModelOutput,
  scope: GroundingScope,
): { summary: string; risks: PrBrief['risks']['risks']; review_focus: PrBrief['review_focus']; dropped: number } {
  let dropped = 0;
  const known = (p: string) => isSafeRepoPath(p) && (scope.prFiles.has(p) || scope.blastCallers.has(p));

  const lineOk = (file: string, line: number) => {
    const hunks = scope.prFiles.get(file);
    if (hunks) return hunks.some((h) => line >= h.start && line <= h.start + Math.max(h.length, 1) - 1);
    return scope.blastCallers.get(file)?.has(line) ?? false;
  };

  const focus: PrBrief['review_focus'] = [];
  for (const f of out.review_focus) {
    const reason = cut(f.reason.trim(), REASON_MAX);
    if (reason && known(f.file) && f.line >= 1 && lineOk(f.file, f.line)) focus.push({ file: f.file, line: f.line, reason });
    else dropped++;
  }

  const refOk = (ref: string) => {
    const m = REF_RE.exec(ref);
    if (!m || !known(m[1]!)) return false;
    if (m[2] === undefined) return true;
    const start = Number(m[2]);
    const end = m[3] === undefined ? start : Number(m[3]);
    return start >= 1 && end >= start;
  };

  const risks: PrBrief['risks']['risks'] = [];
  for (const r of out.risks) {
    const title = cut(r.title.trim(), TITLE_MAX);
    const refs = r.file_refs.filter(refOk);
    if (!title || refs.length === 0) {
      dropped++;
      continue;
    }
    const kind = RiskKind.safeParse(r.kind);
    risks.push({
      kind: kind.success ? kind.data : 'other',
      title,
      explanation: cut(r.explanation, EXPLANATION_MAX),
      severity: r.severity,
      file_refs: refs,
    });
  }

  dropped += Math.max(0, risks.length - RISKS_MAX) + Math.max(0, focus.length - FOCUS_MAX);
  return {
    summary: cut(out.summary.trim(), SUMMARY_MAX),
    risks: risks.slice(0, RISKS_MAX),
    review_focus: focus.slice(0, FOCUS_MAX),
    dropped,
  };
}
