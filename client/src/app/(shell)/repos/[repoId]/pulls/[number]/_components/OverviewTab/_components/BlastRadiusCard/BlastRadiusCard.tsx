"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Card, SectionLabel, Button, Badge, Skeleton, ErrorState, Icon } from "@devdigest/ui";
import { useBlastRadius, blastKeys } from "@/lib/api/blast";
import { useResyncRepoIntel } from "@/lib/api/repo-intel";
import { BlastTree } from "./_components/BlastTree";
import { BlastGraph } from "./_components/BlastGraph";
import { PriorPrs } from "./_components/PriorPrs";
import { blastStats } from "./helpers";
import { s } from "./styles";

export function BlastRadiusCard({
  prId,
  repoId,
  repoFullName,
  headSha,
}: {
  prId: string | null | undefined;
  repoId: string;
  repoFullName: string | null;
  headSha: string;
}) {
  const t = useTranslations("blast");
  const qc = useQueryClient();
  const { data: blast, isLoading, isError, refetch } = useBlastRadius(prId);
  const resync = useResyncRepoIntel(repoId);
  const [view, setView] = React.useState<"tree" | "graph">("tree");

  if (isLoading) {
    return (
      <div style={s.card} role="status" aria-busy="true">
        <Skeleton height={160} />
      </div>
    );
  }

  if (isError || !blast) {
    return (
      <Card style={s.card}>
        <ErrorState title={t("loadError")} onRetry={refetch} />
      </Card>
    );
  }

  const stats = blastStats(blast);

  return (
    <Card style={s.card}>
      <SectionLabel
        icon="Zap"
        right={
          <div role="group" aria-label={t("viewLabel")} style={s.viewGroup}>
            <Button
              kind="tertiary"
              size="sm"
              active={view === "tree"}
              aria-pressed={view === "tree"}
              onClick={() => setView("tree")}
            >
              {t("view.tree")}
            </Button>
            <Button
              kind="tertiary"
              size="sm"
              active={view === "graph"}
              aria-pressed={view === "graph"}
              onClick={() => setView("graph")}
            >
              {t("view.graph")}
            </Button>
          </div>
        }
      >
        {t("title")}
      </SectionLabel>

      <div style={s.statsRow}>
        <span style={s.stat}>
          <Icon.Code size={13} />
          {stats.symbols} {t("stat.symbols")}
        </span>
        <span style={s.stat}>
          <Icon.CornerDownRight size={13} />
          {stats.callers} {t("stat.callers")}
        </span>
        <span style={s.stat}>
          <Icon.Globe size={13} />
          {stats.endpoints} {t("stat.endpoints")}
        </span>
        <span style={s.stat}>
          <Icon.Clock size={13} />
          {stats.crons} {t("stat.crons")}
        </span>
      </div>

      {blast.degraded && (
        <div style={s.degradedRow}>
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("degraded.badge", {
              reason: blast.reason ? t(`degraded.reason.${blast.reason}`) : "",
            })}
          </Badge>
          <Button
            kind="tertiary"
            size="sm"
            icon="RefreshCw"
            loading={resync.isPending}
            onClick={() =>
              resync.mutate(undefined, {
                onSuccess: () => qc.invalidateQueries({ queryKey: blastKeys.radius(prId) }),
              })
            }
          >
            {t("degraded.resync")}
          </Button>
        </div>
      )}

      {blast.downstream.length === 0 ? (
        <div style={s.noDownstream}>{t("noDownstream", { count: blast.changed_symbols.length })}</div>
      ) : view === "tree" ? (
        <BlastTree downstream={blast.downstream} repoFullName={repoFullName} headSha={headSha} />
      ) : (
        <BlastGraph downstream={blast.downstream} />
      )}

      <PriorPrs prId={prId} repoFullName={repoFullName} />
    </Card>
  );
}
