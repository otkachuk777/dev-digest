/* ProjectContextView — repo spec/doc markdown listing (grouped, filterable) + safe preview. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, EmptyState, ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import { contextKeys, useContextDoc, useContextDocs } from "@/lib/api/context";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/api/repo-intel";
import { relativeTime } from "@/lib/date";
import { REFRESH_TIMEOUT_MS, groupDocs, resyncFinished } from "./helpers";
import { s } from "./styles";

export function ProjectContextView({ repoId }: { repoId: string | null }) {
  const t = useTranslations("context");
  const qc = useQueryClient();
  const listing = useContextDocs(repoId);
  const [filter, setFilter] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const doc = useContextDoc(repoId, selected);

  // Refresh: resync, then poll the index state until `updatedAt` moves or the window closes.
  const [refresh, setRefresh] = React.useState<{ before: string | undefined; startedAt: number } | null>(null);
  const resync = useResyncRepoIntel(repoId);
  const intel = useRepoIntelStatus(repoId, refresh !== null);
  const updatedAt = intel.data?.updatedAt;
  const finish = React.useCallback(() => {
    setRefresh(null);
    void qc.invalidateQueries({ queryKey: contextKeys.list(repoId) });
  }, [qc, repoId]);
  React.useEffect(() => {
    if (refresh && resyncFinished(refresh.before, updatedAt, refresh.startedAt, Date.now())) finish();
  }, [refresh, updatedAt, finish]);
  React.useEffect(() => {
    if (!refresh) return;
    const id = setTimeout(finish, REFRESH_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [refresh, finish]);
  const onRefresh = () => {
    setRefresh({ before: updatedAt, startedAt: Date.now() });
    resync.mutate();
  };

  if (!repoId) return <p style={s.message}>{t("selectRepo")}</p>;
  if (listing.isLoading) return <Skeleton height={200} />;
  if (listing.isError || !listing.data) return <ErrorState title={t("loadError")} />;

  const data = listing.data;
  const groups = groupDocs(data.docs, filter);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>{t("title")}</h1>
        <Button kind="secondary" onClick={onRefresh} disabled={refresh !== null}>
          {refresh ? t("refreshing") : t("refresh")}
        </Button>
      </div>

      {data.status === "no_clone" ? (
        <p style={s.message}>{t("noClone")}</p>
      ) : data.docs.length === 0 ? (
        <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.body", { glob: data.glob })} />
      ) : (
        <div style={s.body}>
          <div>
            <input
              style={s.filter}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
            />
            {groups.length === 0 && <p style={s.message}>{t("noMatches")}</p>}
            {groups.map((g) => (
              <section key={g.type}>
                <div style={s.groupLabel}>{t(`groups.${g.type}`)}</div>
                {g.docs.map((d) => (
                  <button key={d.path} style={s.row(d.path === selected)} onClick={() => setSelected(d.path)}>
                    <span style={s.path}>{d.path}</span>
                    <span style={s.tokens}>{t("tokens", { count: d.tokens })}</span>
                  </button>
                ))}
              </section>
            ))}
          </div>
          <div style={s.preview}>
            {doc.isError ? (
              <p style={s.message}>{t("docNotFound")}</p>
            ) : doc.data ? (
              <>
                <div style={s.previewMeta}>
                  <strong>{doc.data.path}</strong>
                  <Badge>{t(`type.${doc.data.type}`)}</Badge>
                  <span>{t("tokens", { count: doc.data.tokens })}</span>
                  <span>
                    {t("usedBy", { agents: doc.data.used_by_agents, skills: doc.data.used_by_skills })}
                  </span>
                </div>
                <Markdown noRemoteImages>{doc.data.content}</Markdown>
              </>
            ) : null}
          </div>
        </div>
      )}

      <div style={s.footer}>
        {t("footer", {
          files: data.docs.length,
          tokens: data.total_tokens,
          when: relativeTime(data.synced_at),
        })}
      </div>
    </div>
  );
}
