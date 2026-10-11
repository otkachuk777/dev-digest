"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SectionLabel } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared";
import { formatWhen } from "@/lib/date";
import { formatCost } from "@/lib/format";
import { PercentBar } from "../../../_components/PercentBar";
import { row, s } from "./styles";

const MAX_ROWS = 100;
const COLS = ["ranAt", "version", "recall", "precision", "citation", "pass", "cost"] as const;

/** Suite runs of one agent (newest first) with a 2-run selection for Compare (AC-61..63). */
export function RunHistoryTable({ runs, onCompare }: { runs: EvalRunRecord[]; onCompare: (ids: [string, string]) => void }) {
  const t = useTranslations("eval.detail");
  const [sel, setSel] = React.useState<string[]>([]);
  const shown = runs.slice(0, MAX_ROWS);
  // Derived: a run that left the range (or was removed) is no longer selected.
  const picked = sel.filter((id) => shown.some((r) => r.id === id));
  const toggle = (id: string) =>
    setSel(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < 2 ? [...picked, id] : [picked[1]!, id]);
  const ready = picked.length === 2;

  return (
    <>
      <div style={s.bar}>
        <SectionLabel icon="History">{t("history")}</SectionLabel>
        <span style={s.hint}>{ready ? t("selected", { n: 2 }) : t("selectHint")}</span>
        <div style={s.barRight}>
          <Button kind={ready ? "primary" : "ghost"} size="sm" icon="Layers" disabled={!ready} onClick={() => onCompare([picked[0]!, picked[1]!])}>
            {t("compare")}
          </Button>
        </div>
      </div>
      <div style={s.table}>
        <div style={row("header", false, false)} aria-hidden>
          <div />
          {COLS.map((c) => (
            <div key={c}>{t(`cols.${c}`)}</div>
          ))}
        </div>
        {shown.map((r, i) => {
          const date = formatWhen(r.started_at);
          const on = picked.includes(r.id);
          return (
            <div key={r.id} style={row("body", on, i === shown.length - 1)}>
              <div>
                {r.status === "done" && (
                  <input type="checkbox" checked={on} onChange={() => toggle(r.id)} aria-label={t("selectRun", { version: r.agent_version, date })} />
                )}
              </div>
              <span className="mono" style={s.muted}>
                {date}
              </span>
              <span className="mono" style={s.version}>
                v{r.agent_version}
              </span>
              {r.status === "done" ? (
                <>
                  <PercentBar value={r.recall} color="var(--accent)" />
                  <PercentBar value={r.precision} color="var(--ok)" />
                  <PercentBar value={r.citation_accuracy} color="var(--warn)" />
                  <span className="tnum" style={s.pass}>
                    {t("passLabel", { passed: r.passed, total: r.total, errored: r.errored })}
                  </span>
                  <span className="mono tnum" style={s.muted}>
                    {formatCost(r.cost_usd)}
                  </span>
                </>
              ) : r.status === "failed" ? (
                <span style={s.failed}>{t("failedReason", { reason: r.error ?? "" })}</span>
              ) : (
                <span style={s.running}>{t("running", { done: r.cases_done, total: r.total })}</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
