/* api/brief.ts — PR Brief (Overview tab).
     GET  /pulls/:id/brief → PrBrief | null (stored, no LLM)
     POST /pulls/:id/brief → PrBrief (one model call, replaces the stored brief) */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { PrBrief } from "@devdigest/shared";

export const briefKeys = {
  get: (prId: string | null | undefined) => ["pr-brief", prId] as const,
};

export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefKeys.get(prId),
    queryFn: () => api.get(`/pulls/${prId}/brief`, PrBrief.nullable()),
    enabled: !!prId,
  });
}

/** `silentError`: the caller's mutation-level `onError` raises its own mapped toast (it still fires
 *  after the card unmounts, unlike a per-`mutate` callback), so the global one is skipped (providers.tsx). */
export function useGenerateBrief(prId: string | null | undefined, onError?: (e: unknown) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/pulls/${prId}/brief`, undefined, PrBrief),
    onSuccess: (data) => qc.setQueryData(briefKeys.get(prId), data),
    onError,
    meta: { silentError: true },
  });
}
