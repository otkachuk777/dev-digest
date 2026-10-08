import React from "react";
import { useTranslations } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import { deltaPt, pct } from "@/lib/eval";
import { s, tileDelta } from "./styles";

/** Four tiles from the latest done run, with ▲/▼ against the previous done run (AC-16). */
export function EvalMetricStrip({ latest, previous }: { latest: EvalRunRecord | undefined; previous: EvalRunRecord | undefined }) {
  const t = useTranslations("eval");
  if (!latest) return <div style={s.noRuns}>{t("evals.noRuns")}</div>;
  const tiles = [
    { label: t("evals.recall"), value: pct(latest.recall), d: deltaPt(latest.recall, previous?.recall ?? null), color: "var(--accent)" },
    { label: t("evals.precision"), value: pct(latest.precision), d: deltaPt(latest.precision, previous?.precision ?? null), color: "var(--ok)" },
    { label: t("evals.citation"), value: pct(latest.citation_accuracy), d: deltaPt(latest.citation_accuracy, previous?.citation_accuracy ?? null), color: "var(--warn)" },
    { label: t("evals.traces"), value: `${latest.passed}/${latest.total}`, d: null, color: "var(--text-secondary)" },
  ];
  return (
    <div style={s.strip}>
      {tiles.map((x) => (
        <div key={x.label} style={s.tile}>
          <div style={s.tileLabel}>{x.label}</div>
          <div style={s.tileValueRow}>
            <span className="tnum" style={{ ...s.tileValue, color: x.color }}>
              {x.value}
            </span>
            {x.d && (
              <span className="tnum" style={tileDelta(x.d.dir)}>
                {x.d.dir === "down" ? "▼ " : x.d.dir === "up" ? "▲ " : ""}
                {t("common.pt", { n: x.d.n })}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
