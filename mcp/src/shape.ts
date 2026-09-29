import type { Agent, ConventionCandidate, ConventionScan, Finding, ReviewRecord, Severity, Verdict } from '@devdigest/shared';

/**
 * DOMAIN — pure. Turns a DTO fetched from the API into the small, capped
 * shape a tool actually returns to the model (principle 3: concise
 * structured response, never a raw dump).
 */

const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

const truncate = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export interface ShapedFinding {
  severity: Severity;
  file: string;
  line: number;
  title: string;
  message: string;
}

export interface ShapedAgent {
  id: string;
  name: string;
  model: string;
  description: string;
  enabled: boolean;
}

export function shapeAgents(agents: Agent[]): ShapedAgent[] {
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    model: a.model,
    description: truncate(a.description, 120),
    enabled: a.enabled,
  }));
}

export interface ReviewLike {
  verdict: Verdict | null;
  summary: string | null;
  score: number | null;
  findings: Finding[];
}

export interface ShapedReview {
  verdict: Verdict | null;
  score: number | null;
  summary: string | null;
  findings: ShapedFinding[];
  total: number;
  truncated: boolean;
}

export function shapeReview(review: ReviewLike, limit = 20): ShapedReview {
  const sorted = [...review.findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const total = sorted.length;
  const kept = sorted.slice(0, limit);
  return {
    verdict: review.verdict,
    score: review.score,
    summary: review.summary ? truncate(review.summary, 300) : review.summary,
    findings: kept.map((f) => ({
      severity: f.severity,
      file: f.file,
      line: f.start_line,
      title: f.title,
      message: truncate(f.rationale, 200),
    })),
    total,
    truncated: total > kept.length,
  };
}

export interface ShapedAgentReview extends ShapedReview {
  agent: string | null;
  model: string | null;
  run_id: string | null;
}

export interface ShapedPrFindings {
  total_findings: number;
  by_severity: Record<Severity, number>;
  reviews: ShapedAgentReview[];
}

/** Each agent's LATEST review only (same rule as server pulls/findings-counts.ts:
 *  group by agent_id, legacy null agent_id = its own group). Counts are taken
 *  before the per-agent limit. Summary-kind rows are skipped. */
export function shapePrFindings(reviews: ReviewRecord[], limitPerAgent = 10): ShapedPrFindings {
  const seen = new Set<string>();
  const kept = reviews
    .filter((r) => r.kind === 'review')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter((r) => {
      const key = r.agent_id ?? r.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const by_severity: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const r of kept) for (const f of r.findings) by_severity[f.severity] += 1;
  return {
    total_findings: by_severity.CRITICAL + by_severity.WARNING + by_severity.SUGGESTION,
    by_severity,
    reviews: kept.map((r) => ({
      agent: r.agent_name ?? null,
      model: r.model,
      run_id: r.run_id,
      ...shapeReview(r, limitPerAgent),
    })),
  };
}

export interface ShapedConvention {
  category: string;
  rule: string;
  file: string;
  line: number;
}

export interface ShapedConventions {
  scanned_at: string | null;
  total: number;
  conventions: ShapedConvention[];
  truncated: boolean;
}

export function shapeConventions(scan: ConventionScan, limit = 30): ShapedConventions {
  const accepted: ConventionCandidate[] = scan.items.filter((c) => c.accepted);
  const total = accepted.length;
  const kept = accepted.slice(0, limit);
  return {
    scanned_at: scan.scanned_at,
    total,
    conventions: kept.map((c) => ({
      category: c.category,
      rule: truncate(c.rule, 200),
      file: c.evidence_path,
      line: c.evidence_start,
    })),
    truncated: total > kept.length,
  };
}

/**
 * Last-resort output-size guard: if the shaped payload (already capped by
 * `limit`) is still over budget — pathologically long file paths/messages —
 * drop trailing findings one at a time until it fits, and mark truncated.
 */
export function capOutput<T extends { findings?: unknown[]; truncated?: boolean }>(
  value: T,
  maxChars = 20_000,
): T {
  if (!Array.isArray(value.findings)) return value;
  let out = value;
  while (JSON.stringify(out).length > maxChars && out.findings && out.findings.length > 0) {
    out = { ...out, findings: out.findings.slice(0, -1), truncated: true };
  }
  return out;
}
