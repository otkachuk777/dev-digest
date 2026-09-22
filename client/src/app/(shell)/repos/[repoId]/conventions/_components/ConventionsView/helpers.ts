import type { ConventionCandidate } from "@devdigest/shared";
import { relativeTime } from "@/lib/date";

export function acceptedOf(items: ConventionCandidate[]): ConventionCandidate[] {
  return items.filter((c) => c.accepted);
}

/** "1h ago" / "just now" for the scan subtitle. */
export function scanWhen(iso: string | null): string {
  const rel = relativeTime(iso);
  if (rel === "—") return "—";
  return rel === "now" ? "just now" : `${rel} ago`;
}
