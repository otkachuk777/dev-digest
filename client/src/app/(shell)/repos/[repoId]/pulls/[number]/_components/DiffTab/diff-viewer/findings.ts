/* Smart Diff findings support for the DiffViewer (Files changed tab). Pure
   helpers + the API shape the viewer needs — same pattern as comments.ts. */
import type { FindingRecord, FindingActionKind, Severity } from "@devdigest/shared";
import { lineKey } from "./comments";

/** What the viewer needs to read + act on Smart Diff findings. */
export interface DiffFindingsApi {
  byPath: Map<string, FindingRecord[]>;
  show: boolean;
  onAction: (findingId: string, action: FindingActionKind) => void;
}

/** The key a finding anchors to: always the new (RIGHT) side. */
export function findingKey(f: Pick<FindingRecord, "start_line">): string | null {
  return lineKey("RIGHT", f.start_line);
}

/**
 * Split a file's findings into those that match a rendered line (keyed,
 * same shape as partitionThreads) and "unanchored" ones whose line isn't in
 * this patch.
 */
export function partitionFindings(
  findings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const unanchored: FindingRecord[] = [];
  for (const f of findings) {
    const key = findingKey(f);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      unanchored.push(f);
    }
  }
  return { matched, unanchored };
}

/** Iterates the wire `Severity` (3 values, not the UI kit's 4) — see
 *  client/INSIGHTS.md "UI Severity vs wire Severity". */
const SEVERITY_RANK: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Most severe severity among a file/line's findings, or null when empty. */
export function topSeverity(findings: FindingRecord[]): Severity | null {
  for (const sev of SEVERITY_RANK) {
    if (findings.some((f) => f.severity === sev)) return sev;
  }
  return null;
}
