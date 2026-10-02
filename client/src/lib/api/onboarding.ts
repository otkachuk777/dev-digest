/* api/onboarding.ts — Onboarding Tour (read the stored tour, generate/regenerate it). */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { OnboardingGenerateResult, OnboardingState } from "@devdigest/shared";

export const onboardingKeys = {
  state: (repoId: string | null | undefined) => ["onboarding", repoId] as const,
};

export function useOnboarding(repoId: string | null | undefined) {
  return useQuery({
    queryKey: onboardingKeys.state(repoId),
    queryFn: () => api.get(`/repos/${repoId}/onboarding`, OnboardingState),
    enabled: !!repoId,
  });
}

/** Blocking generate (≤125 s). On success the new/kept tour replaces `state.tour` in the cache. */
export function useGenerateOnboarding(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post(`/repos/${repoId}/onboarding/generate`, undefined, OnboardingGenerateResult),
    onSuccess: (res) =>
      qc.setQueryData<OnboardingState>(onboardingKeys.state(repoId), (prev) =>
        prev ? { ...prev, tour: res.tour } : prev,
      ),
  });
}
