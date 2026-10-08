import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Sparkline } from "@devdigest/ui";
import type { EvalDashboardAgent } from "@devdigest/shared";
import { pct } from "@/lib/eval";
import { formatWhen } from "@/lib/date";
import { agentRow, s } from "./styles";

function Mini({ label, value, color }: { label: string; value: number | null | undefined; color: string }) {
  return (
    <div style={s.mini}>
      <div style={s.miniLabel}>{label}</div>
      <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color, marginTop: 2 }}>
        {pct(value ?? null)}
      </div>
    </div>
  );
}

/** One agent: name, model chip, last-run line, recall sparkline, latest percents; the whole row links to its detail (AC-72). */
export function AgentRow({ agent }: { agent: EvalDashboardAgent }) {
  const t = useTranslations("eval.dashboard");
  const [hover, setHover] = React.useState(false);
  const l = agent.latest;
  return (
    <Link
      href={`/eval/${agent.agent_id}`}
      style={agentRow(hover)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={s.agentIcon}>
        <Icon.Cpu size={17} />
      </div>
      <div style={s.agentBody}>
        <div style={s.agentTop}>
          <span style={s.agentName}>{agent.name}</span>
          <span className="mono" style={s.chip}>
            {agent.model}
          </span>
        </div>
        <div style={s.lastRun}>
          {l ? t("lastRun", { version: l.agent_version, date: formatWhen(l.started_at), passed: l.passed, total: l.total }) : t("noRuns")}
        </div>
      </div>
      {/* Sparkline divides by (n - 1): one point would give NaN. */}
      {agent.recall_trend.length > 1 && <Sparkline data={agent.recall_trend} color="var(--accent)" w={60} h={24} />}
      <Mini label={t("recall")} value={l?.recall} color="var(--accent)" />
      <Mini label={t("prec")} value={l?.precision} color="var(--ok)" />
      <Mini label={t("cite")} value={l?.citation_accuracy} color="var(--warn)" />
      <Icon.ChevronRight size={18} style={s.chevron} />
    </Link>
  );
}
