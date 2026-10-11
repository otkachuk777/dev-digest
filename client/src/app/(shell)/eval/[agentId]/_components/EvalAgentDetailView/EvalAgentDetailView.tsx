"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Card, Dropdown, ErrorState, Icon, LineChart, SectionLabel, Skeleton, Sparkline } from "@devdigest/ui";
import { EvalRange } from "@devdigest/shared";
import { ShellCrumb } from "@/components/app-shell";
import { useAgent, useAgents } from "@/lib/api/agents";
import { ApiError } from "@/lib/api/client";
import { useEvalCases, useEvalRun, useEvalRuns, useStartEvalRun } from "@/lib/api/eval";
import { deltaPt, latestDone, pct, previousDone } from "@/lib/eval";
import { CompareModal } from "../CompareModal";
import { RegressionBanner } from "../RegressionBanner";
import { RunHistoryTable } from "../RunHistoryTable";
import { parseRange, trend, type MetricKey } from "./helpers";
import { legendSwatch, s, tileDelta } from "./styles";

const METRICS = [
  { id: "recall", key: "recall", color: "var(--accent)" },
  { id: "precision", key: "precision", color: "var(--ok)" },
  { id: "citation", key: "citation_accuracy", color: "var(--warn)" },
] as const satisfies readonly { id: string; key: MetricKey; color: string }[];

/** /eval/[agentId] — KPI tiles, metric trend, regression banner and run history for one agent (SPEC-04). */
export function EvalAgentDetailView() {
  const t = useTranslations("eval");
  const d = useTranslations("eval.detail");
  const { agentId } = useParams<{ agentId: string }>();
  const router = useRouter();
  const range = parseRange(useSearchParams().get("range"));
  const { data: agents } = useAgents();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(agentId);
  const { data: runs } = useEvalRuns(agentId, range);
  const { data: cases } = useEvalCases(agentId);
  const start = useStartEvalRun(agentId);
  const [comparing, setComparing] = React.useState<[string, string] | null>(null);
  const latest = runs && latestDone(runs);
  const prev = runs && previousDone(runs);
  // The banner's "Started failing" needs both run details; fetched only when two done runs exist.
  const { data: latestDetail } = useEvalRun(prev ? latest?.id : undefined);
  const { data: prevDetail } = useEvalRun(prev?.id);

  const crumb = [
    { label: d("crumbLab") },
    { label: d("crumbDashboard"), href: "/eval" },
    ...(agent ? [{ label: agent.name }] : []),
  ];

  if (isError && error instanceof ApiError && error.status === 404) {
    return (
      <>
        <ShellCrumb items={crumb} />
        <div style={s.notFound}>
          <span>{d("notFound")}</span>
          <Link href="/eval">{d("backToDashboard")}</Link>
        </div>
      </>
    );
  }
  if (isError) {
    return (
      <>
        <ShellCrumb items={crumb} />
        <ErrorState fullScreen title={d("loadErrorTitle")} body={d("loadErrorBody")} onRetry={() => refetch()} />
      </>
    );
  }
  if (isLoading || !agent || !runs) {
    return (
      <>
        <ShellCrumb items={crumb} />
        <div style={s.page}>
          <Skeleton height={24} width={240} />
          <Skeleton height={200} />
        </div>
      </>
    );
  }

  const running = runs.find((r) => r.status === "running");
  const goRange = (r: EvalRange) => router.replace(`/eval/${agentId}?range=${r}`);

  return (
    <>
      <ShellCrumb items={crumb} />
      <div style={s.page}>
        <Link href="/eval" style={s.back}>
          <Icon.ChevronLeft size={16} />
          {d("allAgents")}
        </Link>
        <div style={s.head}>
          <div>
            <h1 style={s.title}>
              {agent.name}
              <span className="mono" style={s.chip}>
                {agent.model}
              </span>
            </h1>
            <p style={s.subtitle}>{d("subtitle", { runs: runs.length, cases: cases?.length ?? 0 })}</p>
          </div>
          <div style={s.controls}>
            <Dropdown
              width={220}
              align="right"
              trigger={
                <Button kind="secondary" size="sm" icon="Cpu" iconRight="ChevronDown">
                  {agent.name}
                </Button>
              }
              items={(agents ?? []).map((a) => ({ label: a.name, icon: "Cpu" as const, onClick: () => router.push(`/eval/${a.id}?range=${range}`) }))}
            />
            <div style={s.ranges} role="group" aria-label={d("rangeLabel")}>
              {EvalRange.options.map((r) => (
                <Button key={r} kind="tertiary" size="sm" active={r === range} aria-pressed={r === range} onClick={() => goRange(r)}>
                  {d(`range.${r}`)}
                </Button>
              ))}
            </div>
            <Button kind="primary" size="sm" icon="Play" disabled={!!running || start.isPending || cases?.length === 0}
              title={cases?.length === 0 ? t("evals.addCaseFirst") : undefined}
              onClick={() => start.mutate()}>
              {running ? t("evals.runningProgress", { done: running.cases_done, total: running.total }) : d("runEval")}
            </Button>
          </div>
        </div>

        {latest && <RegressionBanner latest={latest} prev={prev} latestDetail={latestDetail} prevDetail={prevDetail} />}

        <div style={s.tiles}>
          {METRICS.map((m) => {
            const delta = latest && prev ? deltaPt(latest[m.key], prev[m.key]) : null;
            const points = trend(runs, m.key);
            return (
              <div key={m.id} style={s.tile}>
                <div style={s.tileTop}>
                  <span style={s.tileLabel}>{m.id === "citation" ? t("evals.citation") : t(`evals.${m.id}`)}</span>
                  {/* Sparkline divides by (n - 1): one point would give NaN. */}
                  {points.length > 1 && <Sparkline data={points} color={m.color} w={56} h={20} />}
                </div>
                <div style={s.tileValueRow}>
                  <span className="tnum" style={s.tileValue}>
                    {pct(latest ? latest[m.key] : null)}
                  </span>
                  {delta && (
                    <span className="tnum" style={tileDelta(delta.dir)}>
                      {delta.dir === "down" ? "▼ " : delta.dir === "up" ? "▲ " : ""}
                      {t("common.pt", { n: delta.n })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {runs.length === 0 ? (
          <div style={s.empty}>{d("noRunsInRange")}</div>
        ) : (
          <>
            <Card style={s.trendCard}>
              <div style={s.trendHead}>
                <SectionLabel icon="TrendingUp">{d("trend")}</SectionLabel>
                <div style={s.legend} aria-label={d("legendLabel")}>
                  {METRICS.map((m) => (
                    <span key={m.id} style={s.legendItem}>
                      <span style={legendSwatch(m.color)} />
                      {d(`legend.${m.id}`)}
                    </span>
                  ))}
                </div>
              </div>
              <LineChart
                w={900}
                h={200}
                yMin={0}
                yMax={1}
                series={METRICS.map((m) => {
                  const pts = trend(runs, m.key);
                  // ponytail: a lone point is drawn twice so the line is visible (the vendor chart hides dots).
                  return { name: d(`legend.${m.id}`), color: m.color, data: pts.length === 1 ? [pts[0]!, pts[0]!] : pts };
                })}
              />
            </Card>
            <RunHistoryTable
              key={agentId}
              runs={runs}
              onCompare={(ids) => {
                // The Promote gate compares against the live agent: refresh it before Compare opens.
                refetch();
                setComparing(ids);
              }}
            />
          </>
        )}
      </div>
      {comparing && <CompareModal agent={agent} ids={comparing} onClose={() => setComparing(null)} />}
    </>
  );
}
