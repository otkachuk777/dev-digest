"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AgentContext } from "@devdigest/shared";
import { Badge, Button, Checkbox, IconBtn, Skeleton, TextInput } from "@devdigest/ui";
import {
  useAgentContext,
  useContextDocs,
  useSetAgentContext,
  useSetSkillContext,
  useSkillContext,
} from "@/lib/api/context";
import { DocPreviewDrawer } from "../DocPreviewDrawer";
import { buildContextRows, movePath, reorderPaths } from "./helpers";
import { orderBtnWrap, row, s } from "./styles";

/** Context tab shared by the agent and skill editors: attach/detach repo docs,
    reorder the attached ones (order = prompt order) and preview any doc.
    Every change sends the whole ordered set — see `useSetContext`. */
export function ContextTab({
  owner,
  repoId,
  repoName,
  header,
}: {
  owner: { kind: "agent" | "skill"; id: string };
  repoId: string | null;
  /** Display name (`owner/name`) used in the not-found row. */
  repoName: string;
  header?: React.ReactNode;
}) {
  const t = useTranslations("context");
  const listing = useContextDocs(repoId);
  // Only the matching query is enabled (null id disables the other).
  const agentCtx = useAgentContext(owner.kind === "agent" ? owner.id : null, repoId);
  const skillCtx = useSkillContext(owner.kind === "skill" ? owner.id : null, repoId);
  const setAgent = useSetAgentContext();
  const setSkill = useSetSkillContext();
  const ownerCtx = owner.kind === "agent" ? agentCtx : skillCtx;
  const setter = owner.kind === "agent" ? setAgent : setSkill;
  const [filter, setFilter] = React.useState("");
  const [preview, setPreview] = React.useState<string | null>(null);
  // The path being dragged. A ref, not state: nothing re-renders while dragging.
  const dragPath = React.useRef<string | null>(null);

  if (!repoId) return <p style={s.message}>{t("selectRepo")}</p>;
  if (listing.isError || ownerCtx.isError) {
    return (
      <p role="alert" style={s.error}>
        {t("loadError")}
      </p>
    );
  }
  const ctx = ownerCtx.data;
  if (listing.isLoading || ownerCtx.isLoading || !listing.data || !ctx) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <Skeleton height={200} />
      </div>
    );
  }

  const paths = ctx.attached.map((a) => a.path);
  const commit = (next: string[]) => setter.mutate({ id: owner.id, repoId, paths: next });
  const toggle = (path: string) =>
    commit(paths.includes(path) ? paths.filter((p) => p !== path) : [...paths, path]);
  const drop = (toPath: string) => {
    const from = dragPath.current;
    dragPath.current = null;
    if (!from) return;
    const next = reorderPaths(paths, paths.indexOf(from), paths.indexOf(toPath));
    if (next !== paths) commit(next);
  };

  const rows = buildContextRows(listing.data, { attached: ctx.attached, inherited: (ctx as Partial<AgentContext>).inherited });
  const q = filter.trim().toLowerCase();
  const visible = q ? rows.filter((r) => r.path.toLowerCase().includes(q)) : rows;

  return (
    <div style={s.wrap}>
      {header}
      <div style={s.header}>
        <Badge>{t("tab.attachedCount", { count: paths.length, total: listing.data.docs.length })}</Badge>
        <span>{t("tab.totalTokens", { count: ctx.total_tokens })}</span>
        <div style={s.filter}>
          <TextInput value={filter} onChange={setFilter} placeholder={t("tab.filterPlaceholder")} />
        </div>
      </div>
      {ctx.truncated_paths.length > 0 && (
        <p style={s.warn}>
          {t("tab.overBudget", { budget: ctx.budget_tokens, paths: ctx.truncated_paths.join(", ") })}
        </p>
      )}
      {setter.isError && (
        <p role="alert" style={s.error}>
          {t("tab.saveError")}
        </p>
      )}
      {listing.data.docs.length === 0 ? (
        <div style={s.message}>
          <p>{t("tab.noDocs")}</p>
          <Link href={`/repos/${repoId}/context`}>{t("tab.openProjectContext")}</Link>
        </div>
      ) : visible.length === 0 ? (
        <p style={s.message}>{t("noMatches")}</p>
      ) : (
        <ul style={s.list}>
          {visible.map((r) => {
            const pos = paths.indexOf(r.path);
            const attached = r.origin === "attached";
            return (
              <li
                key={r.path}
                draggable={attached}
                onDragStart={() => {
                  dragPath.current = r.path;
                }}
                onDragEnd={() => {
                  dragPath.current = null;
                }}
                onDragOver={(e) => {
                  if (dragPath.current && attached) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (attached) drop(r.path);
                }}
                style={row(attached, attached)}
              >
                {attached ? (
                  <div style={s.order}>
                    <span style={orderBtnWrap(pos === 0)}>
                      <IconBtn icon="ArrowUp" label={t("tab.moveUp")} size={20} onClick={() => commit(movePath(paths, r.path, -1))} />
                    </span>
                    <span style={orderBtnWrap(pos === paths.length - 1)}>
                      <IconBtn icon="ArrowDown" label={t("tab.moveDown")} size={20} onClick={() => commit(movePath(paths, r.path, 1))} />
                    </span>
                  </div>
                ) : (
                  <div style={s.spacer} />
                )}
                {r.origin === "inherited" ? (
                  <span className="mono" style={s.path} title={r.path}>
                    {r.path}
                  </span>
                ) : (
                  <div style={s.label}>
                    <Checkbox
                      checked={attached}
                      onChange={() => toggle(r.path)}
                      label={
                        <span className="mono" style={s.path} title={r.path}>
                          {r.path}
                        </span>
                      }
                    />
                  </div>
                )}
                {r.status === "not_found" ? (
                  <>
                    <span style={s.missing}>{t("tab.notFound", { repo: repoName })}</span>
                    {r.origin === "inherited" ? (
                      <span style={s.meta}>{t("tab.via", { skill: r.skillName ?? "" })}</span>
                    ) : (
                      <Button kind="ghost" onClick={() => toggle(r.path)}>
                        {t("tab.detach")}
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    {r.origin === "inherited" && <span style={s.meta}>{t("tab.via", { skill: r.skillName ?? "" })}</span>}
                    {r.type && <Badge>{t(`type.${r.type}`)}</Badge>}
                    <span style={s.meta}>{t("tokens", { count: r.tokens })}</span>
                    <Button kind="ghost" aria-label={`${t("tab.preview")} ${r.path}`} onClick={() => setPreview(r.path)}>
                      {t("tab.preview")}
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {preview && (
        <DocPreviewDrawer
          repoId={repoId}
          path={preview}
          attached={paths.includes(preview)}
          onToggleAttached={() => toggle(preview)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
