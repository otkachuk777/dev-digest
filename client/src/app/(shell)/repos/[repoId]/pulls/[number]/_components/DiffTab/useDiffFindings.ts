"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FindingActionKind } from "@devdigest/shared";
import {
  reviewKeys,
  useFindingAction,
  usePrActiveRuns,
  usePrReviews,
} from "@/lib/api/reviews";
import { latestFindingsPerAgent } from "../../_lib/findings";

/**
 * Smart Diff findings for the DiffTab: each agent's latest findings, grouped
 * by file, plus accept/dismiss and a refetch when a run finishes.
 */
export function useDiffFindings(prId: string | null) {
  const { data: reviews } = usePrReviews(prId);
  const findingAction = useFindingAction();
  const qc = useQueryClient();

  const byPath = React.useMemo(() => latestFindingsPerAgent(reviews ?? []), [reviews]);
  const hasReviews = reviews?.some((r) => r.kind === "review") ?? false;

  // Refresh reviews once the last active run finishes (server-side source of
  // truth for "running"), so accepted/dismissed state and new findings show
  // up without a manual reload.
  const { data: activeRuns } = usePrActiveRuns(prId);
  const running = (activeRuns?.length ?? 0) > 0;
  const wasRunning = React.useRef(running);
  React.useEffect(() => {
    if (wasRunning.current && !running) {
      qc.invalidateQueries({ queryKey: reviewKeys.list(prId) });
    }
    wasRunning.current = running;
  }, [running, prId, qc]);

  const onAction = React.useCallback(
    (findingId: string, action: FindingActionKind) => {
      findingAction.mutate({ findingId, action, prId: prId ?? undefined });
    },
    [findingAction, prId],
  );

  return { byPath, hasReviews, onAction };
}
