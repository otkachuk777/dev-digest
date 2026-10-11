"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { ShellCrumb } from "@/components/app-shell";
import { useEvalDashboard, useRunAllEvals } from "@/lib/api/eval";
import { notify } from "@/lib/toast";
import { AgentRow } from "./AgentRow";
import { RecentRunsTable } from "./RecentRunsTable";
import { s } from "./styles";

/** /eval — every agent's latest eval at a glance plus the cross-agent recent runs (SPEC-04). */
export function EvalDashboardView() {
  const t = useTranslations("eval.dashboard");
  const { data, isLoading, isError, refetch } = useEvalDashboard();
  const runAll = useRunAllEvals();
  const crumb = <ShellCrumb items={[{ label: t("crumbLab") }, { label: t("crumb") }]} />;

  const onRunAll = () =>
    runAll.mutate(undefined, {
      onSuccess: (r) => notify.success(t("started", { started: r.started.length, skipped: r.skipped.length })),
    });

  if (isError) {
    return (
      <>
        {crumb}
        <ErrorState fullScreen title={t("loadErrorTitle")} body={t("loadErrorBody")} onRetry={() => refetch()} />
      </>
    );
  }

  return (
    <>
      {crumb}
      <div style={s.page}>
        <div style={s.head}>
          <div>
            <h1 style={s.title}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <div style={s.headRight}>
            <Button kind="primary" size="sm" icon="Play" disabled={runAll.isPending} onClick={onRunAll}>
              {t("runAll")}
            </Button>
          </div>
        </div>
        <SectionLabel icon="Cpu">{t("agents")}</SectionLabel>
        {isLoading || !data ? (
          <Skeleton height={200} />
        ) : (
          <>
            <div style={s.list}>
              {data.agents.map((a) => (
                <AgentRow key={a.agent_id} agent={a} />
              ))}
            </div>
            {data.recent_runs.length > 0 ? (
              <>
                <SectionLabel icon="History">{t("recent")}</SectionLabel>
                <RecentRunsTable runs={data.recent_runs} />
              </>
            ) : (
              <div style={s.empty}>{t("emptyRecent")}</div>
            )}
          </>
        )}
      </div>
    </>
  );
}
