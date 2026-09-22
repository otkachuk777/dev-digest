/* api/conventions.ts — Conventions Extractor (scan a repo, review candidates). */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import {
  ConventionCandidate,
  ConventionScan,
  type UpdateConventionInput,
} from "@devdigest/shared";

export const conventionKeys = {
  list: (repoId: string | null | undefined) => ["conventions", repoId] as const,
};

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionKeys.list(repoId),
    queryFn: () => api.get(`/repos/${repoId}/conventions`, ConventionScan),
    enabled: !!repoId,
  });
}

/** Run a scan. It replaces the repo's previous candidates, so the response IS the new list. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/repos/${repoId}/conventions/extract`, undefined, ConventionScan),
    onSuccess: (scan) => qc.setQueryData(conventionKeys.list(repoId), scan),
  });
}

/** Accept / un-accept a candidate, or edit its rule text. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateConventionInput }) =>
      api.patch(`/conventions/${id}`, patch, ConventionCandidate),
    onSuccess: () => qc.invalidateQueries({ queryKey: conventionKeys.list(repoId) }),
  });
}

/** Reject = delete: a rejected candidate never comes back and never reaches the skill. */
export function useRejectConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/conventions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: conventionKeys.list(repoId) }),
  });
}
