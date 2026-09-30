/* api/blast.ts — Blast radius + prior PRs (Overview tab).
     GET /pulls/:id/blast    → BlastRadius (from the repo-intel index, no reparse/LLM)
     GET /pulls/:id/history  → PrHistory (merged PRs touching the same files, lazy) */

import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { BlastRadius, PrHistory } from "@devdigest/shared";

export const blastKeys = {
  radius: (prId: string | null | undefined) => ["blast", prId] as const,
  history: (prId: string | null | undefined) => ["blast-history", prId] as const,
};

export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: blastKeys.radius(prId),
    queryFn: () => api.get(`/pulls/${prId}/blast`, BlastRadius),
    enabled: !!prId,
  });
}

/** Lazy: fetched only once the prior-PRs section is expanded (costs GitHub calls). */
export function usePriorPrs(prId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: blastKeys.history(prId),
    queryFn: () => api.get(`/pulls/${prId}/history`, PrHistory),
    enabled: !!prId && enabled,
  });
}
