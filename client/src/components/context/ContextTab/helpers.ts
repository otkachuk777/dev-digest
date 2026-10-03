import type { ContextAttachmentRow, ContextDocType, ContextInheritedRow, ContextListing } from "@devdigest/shared";

export interface ContextRow {
  path: string;
  type: ContextDocType | null;
  tokens: number;
  status: "present" | "not_found";
  origin: "attached" | "inherited" | "other";
  /** Name of the skill an inherited doc comes from. */
  skillName?: string;
}

/** Attached (stored order) → inherited (read-only) → the other listed docs.
    A path appears once, at its first origin (an agent doc that a skill also attaches is "attached"). */
export function buildContextRows(
  listing: ContextListing,
  context: { attached: ContextAttachmentRow[]; inherited?: ContextInheritedRow[] },
): ContextRow[] {
  const seen = new Set<string>();
  const rows: ContextRow[] = [];
  const add = (r: ContextRow) => {
    if (seen.has(r.path)) return;
    seen.add(r.path);
    rows.push(r);
  };
  for (const a of context.attached) add({ ...a, origin: "attached" });
  for (const i of context.inherited ?? []) add({ ...i, origin: "inherited", skillName: i.skill_name });
  for (const d of listing.docs) add({ path: d.path, type: d.type, tokens: d.tokens, status: "present", origin: "other" });
  return rows;
}

/** Move the entry at `from` to index `to`, shifting the ones between. Same array when nothing moves. */
export function reorderPaths(paths: string[], from: number, to: number): string[] {
  if (from < 0 || to < 0 || from >= paths.length || to >= paths.length || from === to) return paths;
  const next = [...paths];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export function movePath(paths: string[], path: string, dir: -1 | 1): string[] {
  const i = paths.indexOf(path);
  return reorderPaths(paths, i, i + dir);
}
