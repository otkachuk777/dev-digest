import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { EvalDashboard } from "@devdigest/shared";
import { formatWhen } from "@/lib/date";
import { PercentBar } from "../PercentBar";
import { recentRow, s } from "./styles";

/** The newest done runs across all agents; a row links to that agent's detail page (AC-73). */
export function RecentRunsTable({ runs }: { runs: EvalDashboard["recent_runs"] }) {
  const t = useTranslations("eval.dashboard");
  const cols = ["agent", "ranAt", "version", "recall", "precision", "citation", "pass"] as const;
  return (
    <div style={s.table}>
      <div style={recentRow(true, false)} aria-hidden>
        {cols.map((c) => (
          <div key={c}>{t(`cols.${c}`)}</div>
        ))}
      </div>
      {runs.map((r, i) => (
        <Link key={r.id} href={`/eval/${r.agent_id}`} style={recentRow(false, i === runs.length - 1)}>
          <span style={s.agentName2}>{r.agent_name}</span>
          <span className="mono" style={s.muted}>
            {formatWhen(r.started_at)}
          </span>
          <span className="mono" style={s.version}>
            v{r.agent_version}
          </span>
          <PercentBar value={r.recall} color="var(--accent)" />
          <PercentBar value={r.precision} color="var(--ok)" />
          <PercentBar value={r.citation_accuracy} color="var(--warn)" />
          <span className="tnum" style={s.pass}>
            {r.passed}/{r.total}
          </span>
        </Link>
      ))}
    </div>
  );
}
