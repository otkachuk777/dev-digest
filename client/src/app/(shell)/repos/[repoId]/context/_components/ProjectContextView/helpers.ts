import type { ContextDoc, ContextDocType } from "@devdigest/shared";

export const REFRESH_TIMEOUT_MS = 60_000;

export const TYPE_ORDER: ContextDocType[] = ["specs", "docs", "insights"];

/** A resync is done once the index state's `updatedAt` moved, or the poll window ran out. */
export function resyncFinished(
  before: string | undefined,
  current: string | undefined,
  startedAt: number,
  nowMs: number,
): boolean {
  return current !== before || nowMs - startedAt >= REFRESH_TIMEOUT_MS;
}

/** Case-insensitive substring filter on path, grouped by type in TYPE_ORDER (empty groups dropped). */
export function groupDocs(docs: ContextDoc[], filter: string) {
  const q = filter.trim().toLowerCase();
  const shown = q ? docs.filter((d) => d.path.toLowerCase().includes(q)) : docs;
  return TYPE_ORDER.map((type) => ({ type, docs: shown.filter((d) => d.type === type) })).filter(
    (g) => g.docs.length > 0,
  );
}
