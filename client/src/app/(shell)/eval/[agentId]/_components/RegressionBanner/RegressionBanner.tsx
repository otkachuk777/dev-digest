import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalRunDetail, EvalRunRecord } from "@devdigest/shared";
import { bannerSentences } from "./helpers";
import { s } from "./styles";

/** Warning when a metric of the latest done run fell ≥ 1pt below the previous one. Template text only (AC-79). */
export function RegressionBanner({
  latest, prev, latestDetail, prevDetail,
}: { latest: EvalRunRecord; prev?: EvalRunRecord; latestDetail?: EvalRunDetail; prevDetail?: EvalRunDetail }) {
  const t = useTranslations("eval.detail.banner");
  if (!prev) return null;
  const sentences = bannerSentences(latest, prev, latestDetail, prevDetail);
  if (sentences.length === 0) return null;
  const text = sentences
    .map((x) =>
      x.kind === "failing"
        ? t("failing", { names: x.names.join(", ") })
        : x.kind === "dropped"
          ? t("dropped", { metric: t(`metric.${x.metric}`), n: x.n, from: x.from, to: x.to })
          : t("up", { metric: t(`metric.${x.metric}`), n: x.n }),
    )
    .join(" ");
  return (
    <div role="alert" style={s.banner}>
      <Icon.AlertTriangle size={16} style={s.icon} />
      <span style={s.text}>{text}</span>
    </div>
  );
}
