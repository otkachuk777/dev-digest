import type { PrBrief, ReviewRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api/client";

/** Domain rule: a brief goes stale the moment the PR's head moves past the sha it was generated for. */
export function isBriefStale(brief: PrBrief, prHeadSha: string): boolean {
  return brief.head_sha !== prHeadSha;
}

/** The single newest `review`-kind record (EC-5) — summaries never feed the banner. */
export function latestReview(reviews: ReviewRecord[] | undefined): ReviewRecord | null {
  let best: ReviewRecord | null = null;
  for (const r of reviews ?? []) {
    if (r.kind !== "review") continue;
    if (!best || r.created_at > best.created_at) best = r;
  }
  return best;
}

/** `path`, `path:12` or `path:12-18` → file + first line (null when the ref has none). */
export function parseRef(ref: string): { file: string; line: number | null } {
  const m = /^(.+?):(\d+)(?:-\d+)?$/.exec(ref);
  return m ? { file: m[1] ?? ref, line: Number(m[2]) } : { file: ref, line: null };
}

/** Message key (under `brief.card.toast`) for errors that have their own copy; null → show the server message. */
export function errorCopyKey(err: unknown): "inProgress" | "emptyDiff" | "rateLimited" | null {
  if (!(err instanceof ApiError)) return null;
  if (err.code === "brief_in_progress") return "inProgress";
  if (err.code === "empty_diff") return "emptyDiff";
  if (err.status === 429) return "rateLimited";
  return null;
}
