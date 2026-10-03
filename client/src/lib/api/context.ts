/* api/context.ts — Project Context: repo doc listing + per-agent / per-skill attachments. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import {
  AgentContext,
  ContextDocFile,
  ContextListing,
  SkillContext,
} from "@devdigest/shared";

type Id = string | null | undefined;

export const contextKeys = {
  list: (repoId: Id) => ["context", repoId] as const,
  file: (repoId: Id, path: Id) => ["context", repoId, "file", path] as const,
  agent: (agentId: Id, repoId: Id) => ["agent", agentId, "context", repoId] as const,
  skill: (skillId: Id, repoId: Id) => ["skill", skillId, "context", repoId] as const,
};

export function useContextDocs(repoId: Id) {
  return useQuery({
    queryKey: contextKeys.list(repoId),
    queryFn: () => api.get(`/repos/${repoId}/context`, ContextListing),
    enabled: !!repoId,
  });
}

export function useContextDoc(repoId: Id, path: Id) {
  return useQuery({
    queryKey: contextKeys.file(repoId, path),
    queryFn: () =>
      api.get(
        `/repos/${repoId}/context/file?path=${encodeURIComponent(path as string)}`,
        ContextDocFile,
      ),
    enabled: !!repoId && !!path,
  });
}

export function useAgentContext(agentId: Id, repoId: Id) {
  return useQuery({
    queryKey: contextKeys.agent(agentId, repoId),
    queryFn: () => api.get(`/agents/${agentId}/context?repo_id=${repoId}`, AgentContext),
    enabled: !!agentId && !!repoId,
  });
}

export function useSkillContext(skillId: Id, repoId: Id) {
  return useQuery({
    queryKey: contextKeys.skill(skillId, repoId),
    queryFn: () => api.get(`/skills/${skillId}/context?repo_id=${repoId}`, SkillContext),
    enabled: !!skillId && !!repoId,
  });
}

/**
 * Replaces the owner's whole ordered path set for one repo. Optimistic like
 * `useSetAgentSkills`: `paths` is written onto the cached `attached` rows before
 * the request goes out, rolled back on error, re-fetched on settle (the server
 * is the source of truth for tokens/status/truncation).
 */
function useSetContext<T extends { attached: { path: string }[] }>(
  kind: "agent" | "skill",
  schema: Parameters<typeof api.put<T>>[2],
) {
  const qc = useQueryClient();
  const key = (id: string, repoId: string) =>
    kind === "agent" ? contextKeys.agent(id, repoId) : contextKeys.skill(id, repoId);
  return useMutation({
    mutationFn: ({ id, repoId, paths }: { id: string; repoId: string; paths: string[] }) =>
      api.put(`/${kind}s/${id}/context`, { repo_id: repoId, paths }, schema),
    onMutate: async ({ id, repoId, paths }) => {
      await qc.cancelQueries({ queryKey: key(id, repoId) });
      const previous = qc.getQueryData<T>(key(id, repoId));
      if (previous) {
        const byPath = new Map(previous.attached.map((r) => [r.path, r]));
        const attached = paths.map(
          (path) => byPath.get(path) ?? { path, type: null, tokens: 0, status: "present" as const },
        );
        qc.setQueryData(key(id, repoId), { ...previous, attached });
      }
      return { previous };
    },
    onError: (_err, { id, repoId }, ctx) => {
      if (ctx?.previous) qc.setQueryData(key(id, repoId), ctx.previous);
    },
    onSettled: (_d, _e, { id, repoId }) => {
      qc.invalidateQueries({ queryKey: key(id, repoId) });
      qc.invalidateQueries({ queryKey: contextKeys.list(repoId) });
    },
  });
}

export const useSetAgentContext = () => useSetContext<AgentContext>("agent", AgentContext);
export const useSetSkillContext = () => useSetContext<SkillContext>("skill", SkillContext);
