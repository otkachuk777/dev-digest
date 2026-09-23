import type { PrIntentRecord } from "@devdigest/shared";

/** Domain rule: an intent goes stale the moment the PR's head moves past the sha it was derived from. */
export function isIntentStale(intent: PrIntentRecord, prHeadSha: string): boolean {
  return intent.head_sha !== prHeadSha;
}
