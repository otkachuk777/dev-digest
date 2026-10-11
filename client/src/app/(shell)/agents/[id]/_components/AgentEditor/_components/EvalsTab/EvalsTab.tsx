"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, MonoLink, SectionLabel, Skeleton } from "@devdigest/ui";
import { ConfirmModal } from "@/components/confirm-modal";
import { useDeleteEvalCase, useEvalCases, useEvalRuns, useRunEvalCase, useStartEvalRun } from "@/lib/api/eval";
import { latestDone, previousDone } from "@/lib/eval";
import { EvalCaseModal } from "../EvalCaseModal";
import { EvalCaseRow } from "./EvalCaseRow";
import { EvalMetricStrip } from "./EvalMetricStrip";
import { s } from "./styles";

/** Agent editor → Evals tab: metrics of the latest suite run, the case list, run-all (SPEC-04). */
export function EvalsTab({ agentId, agentName }: { agentId: string; agentName: string }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const { data: cases, isLoading } = useEvalCases(agentId);
  const { data: runs } = useEvalRuns(agentId, "all");
  const start = useStartEvalRun(agentId);
  const runCase = useRunEvalCase();
  const del = useDeleteEvalCase();
  // "new" | a case id | null. The id (not the case) so the modal sees the refreshed last result.
  const [open, setOpen] = React.useState<"new" | string | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  if (isLoading || !cases) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <Skeleton height={200} />
      </div>
    );
  }

  const running = (runs ?? []).find((r) => r.status === "running");
  const ran = cases.filter((c) => c.last_result).length;
  const passing = cases.filter((c) => c.last_result?.status === "pass").length;
  const noCases = cases.length === 0;
  const editing = open && open !== "new" ? cases.find((c) => c.id === open) ?? null : null;
  const toDelete = cases.find((c) => c.id === deleting);

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <SectionLabel icon="Gauge">{t("evals.metrics")}</SectionLabel>
        <div style={{ marginLeft: "auto" }}>
          <MonoLink onClick={() => router.push(`/eval/${agentId}`)}>{t("evals.viewDashboard")}</MonoLink>
        </div>
      </div>
      <EvalMetricStrip latest={runs && latestDone(runs)} previous={runs && previousDone(runs)} />
      <div style={s.note}>
        <Icon.Code size={12} />
        {t("evals.scoringNote")}
      </div>
      <div style={s.casesHead}>
        <h2 style={s.h2}>{t("evals.casesHeading")}</h2>
        <Badge color={passing === ran ? "var(--ok)" : "var(--warn)"} bg={passing === ran ? "var(--ok-bg)" : "var(--warn-bg)"}>
          {t("evals.passingBadge", { passing, ran })}
        </Badge>
        <Badge color="var(--text-muted)">{t("evals.casesBadge", { n: cases.length })}</Badge>
        <div style={s.actions}>
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            disabled={noCases || !!running || start.isPending}
            title={noCases ? t("evals.addCaseFirst") : undefined}
            onClick={() => start.mutate()}
          >
            {running ? t("evals.runningProgress", { done: running.cases_done, total: running.total }) : t("evals.runAll")}
          </Button>
          <Button kind="primary" size="sm" icon="Plus" onClick={() => setOpen("new")}>
            {t("evals.newCase")}
          </Button>
        </div>
      </div>
      {noCases ? (
        <div style={s.empty}>
          <span>{t("evals.empty")}</span>
          <Button kind="primary" size="sm" icon="Plus" onClick={() => setOpen("new")}>
            {t("evals.newCase")}
          </Button>
        </div>
      ) : (
        cases.map((c) => (
          <EvalCaseRow
            key={c.id}
            c={c}
            running={runCase.isPending && runCase.variables === c.id}
            onOpen={() => setOpen(c.id)}
            onRun={() => runCase.mutate(c.id)}
            onDelete={() => setDeleting(c.id)}
          />
        ))
      )}
      {(open === "new" || editing) && (
        <EvalCaseModal key={open} agentId={agentId} agentName={agentName} evalCase={editing} onClose={() => setOpen(null)} />
      )}
      {toDelete && (
        <ConfirmModal
          danger
          title={t("evals.delete.title")}
          body={t("evals.delete.confirm", { name: toDelete.name })}
          confirmLabel={t("evals.delete.label")}
          cancelLabel={t("evals.delete.cancel")}
          busy={del.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => del.mutate(toDelete.id, { onSettled: () => setDeleting(null) })}
        />
      )}
    </div>
  );
}
