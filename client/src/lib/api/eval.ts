/* api/eval.ts — SPEC-04 eval pipeline: cases, suite runs, dashboard.
   No fetch timeout on purpose: POST /eval-cases/:id/run is synchronous and may take up to 125 s;
   the browser waits and no proxy sits between the client and the API. */

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "./client";
import { agentKeys } from "./agents";
import { notify } from "@/lib/toast";
import { evalErrorCode } from "@/lib/eval";
import {
  Agent,
  EvalCase,
  EvalCaseFromFindingResult,
  EvalCaseInput,
  EvalCaseResult,
  EvalDashboard,
  EvalRunAllResult,
  EvalRunDetail,
  EvalRunRecord,
  type EvalRange,
} from "@devdigest/shared";

export const evalKeys = {
  all: ["eval"] as const,
  cases: (agentId: string | null | undefined) => ["eval", "cases", agentId] as const,
  runs: (agentId: string | null | undefined, range: EvalRange) => ["eval", "runs", agentId, range] as const,
  run: (id: string | null | undefined) => ["eval", "run", id] as const,
  dashboard: ["eval", "dashboard"] as const,
};

/** Toast for run-start / run-all / from-finding / single-run failures: mapped copy for known codes,
 *  the server message otherwise. Defined on the mutation so it still fires after the page is left (AC-49). */
function useEvalErrorToast() {
  const t = useTranslations("eval");
  return (e: unknown) => {
    const code = evalErrorCode(e);
    notify.error(code ? t(`errors.${code}`) : e instanceof Error ? e.message : String(e));
  };
}

export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.cases(agentId),
    queryFn: () => api.get(`/agents/${agentId}/eval-cases`, EvalCase.array()),
    enabled: !!agentId,
  });
}

export function useCreateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput) => api.post(`/agents/${agentId}/eval-cases`, input, EvalCase),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalKeys.all }),
    meta: { silentError: true }, // 400/409 are shown inline in the case modal
  });
}

export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EvalCaseInput }) => api.put(`/eval-cases/${id}`, input, EvalCase),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalKeys.all }),
    meta: { silentError: true },
  });
}

export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/eval-cases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalKeys.all }),
  });
}

export function useRunEvalCase() {
  const qc = useQueryClient();
  const onError = useEvalErrorToast();
  return useMutation({
    mutationFn: (id: string) => api.post(`/eval-cases/${id}/run`, undefined, EvalCaseResult),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalKeys.all }),
    onError,
    meta: { silentError: true },
  });
}

export function useCaseFromFinding() {
  const qc = useQueryClient();
  const onError = useEvalErrorToast();
  return useMutation({
    mutationFn: (findingId: string) => api.post(`/findings/${findingId}/eval-case`, undefined, EvalCaseFromFindingResult),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalKeys.all }),
    onError,
    meta: { silentError: true },
  });
}

export function useStartEvalRun(agentId: string) {
  const qc = useQueryClient();
  const onError = useEvalErrorToast();
  return useMutation({
    mutationFn: () => api.post(`/agents/${agentId}/eval-runs`, undefined, EvalRunRecord),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalKeys.all }),
    onError,
    meta: { silentError: true },
  });
}

export function useRunAllEvals() {
  const qc = useQueryClient();
  const onError = useEvalErrorToast();
  return useMutation({
    mutationFn: () => api.post("/eval/run-all", undefined, EvalRunAllResult),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalKeys.all }),
    onError,
    meta: { silentError: true },
  });
}

/** When `running` flips true -> false (a suite run reached a terminal state), refresh everything
 *  derived from it: case last_result, dashboard, run lists, and the agent used by Compare. */
function useRefreshWhenRunFinishes(running: boolean) {
  const qc = useQueryClient();
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !running) {
      qc.invalidateQueries({ queryKey: evalKeys.all });
      qc.invalidateQueries({ queryKey: agentKeys.all });
    }
    was.current = running;
  }, [running, qc]);
}

/** Polls every 2 s while any run of the agent is `running` (AC-45). */
export function useEvalRuns(agentId: string | null | undefined, range: EvalRange) {
  const query = useQuery({
    queryKey: evalKeys.runs(agentId, range),
    queryFn: () => api.get(`/agents/${agentId}/eval-runs?range=${range}`, EvalRunRecord.array()),
    enabled: !!agentId,
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 2000 : false),
  });
  useRefreshWhenRunFinishes(!!query.data?.some((r) => r.status === "running"));
  return query;
}

export function useEvalRun(id: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.run(id),
    queryFn: () => api.get(`/eval-runs/${id}`, EvalRunDetail),
    enabled: !!id,
  });
}

/** Applies run `runId`'s snapshot to the agent. The toast lives here so it survives the modal closing (AC-69). */
export function usePromoteRun() {
  const qc = useQueryClient();
  const t = useTranslations("eval");
  const onError = useEvalErrorToast();
  return useMutation({
    mutationFn: ({ runId }: { runId: string; version: number }) => api.post(`/eval-runs/${runId}/promote`, undefined, Agent),
    onSuccess: (agent, { version }) => {
      qc.invalidateQueries({ queryKey: evalKeys.all });
      qc.invalidateQueries({ queryKey: agentKeys.all });
      notify.success(t("compare.promoted", { from: version, to: agent.version }));
    },
    onError,
    meta: { silentError: true },
  });
}

export function useEvalDashboard() {
  const isRunning = (d?: EvalDashboard) => !!d?.agents.some((a) => a.running);
  const query = useQuery({
    queryKey: evalKeys.dashboard,
    queryFn: () => api.get("/eval/dashboard", EvalDashboard),
    refetchInterval: (q) => (isRunning(q.state.data) ? 2000 : false),
  });
  useRefreshWhenRunFinishes(isRunning(query.data));
  return query;
}
