/* BriefBanner — the latest review's verdict + counts + score, the brief summary and Refresh. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Button, CircularScore } from "@devdigest/ui";
import type { ReviewRecord } from "@devdigest/shared";
import { VERDICT_META } from "../../../../../../_lib/verdict";
import { s } from "./styles";

export function BriefBanner({
  review,
  summary,
  stale,
  generating,
  onRefresh,
}: {
  review: ReviewRecord | null;
  summary: string;
  stale: boolean;
  /** Label of the Refresh control while a generation is pending; null when idle. */
  generating: string | null;
  onRefresh: () => void;
}) {
  const t = useTranslations("brief");
  const tp = useTranslations("prReview");
  const m = review?.verdict ? VERDICT_META[review.verdict] : null;
  const VIcon = m ? Icon[m.icon] : null;
  const findings = review?.findings ?? [];
  const blockers = findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;

  return (
    <div style={s.wrap}>
      {m && VIcon && (
        <div style={s.iconBox(m.bg, m.c)}>
          <VIcon size={22} />
        </div>
      )}
      <div style={s.main}>
        <div style={s.titleRow}>
          {m && review ? (
            <>
              <span style={s.label(m.c)}>{tp(`verdict.${m.labelKey}`)}</span>
              <Badge color="var(--text-secondary)">
                {tp("verdict.findingsCount", { count: findings.length })}
                {blockers > 0 ? tp("verdict.blockers", { count: blockers }) : ""}
              </Badge>
            </>
          ) : (
            <span style={s.label("var(--text-secondary)")}>{t("card.noReview")}</span>
          )}
          {stale && (
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("card.stale")}
            </Badge>
          )}
        </div>
        <p style={s.summary}>{summary}</p>
      </div>
      <Button
        kind="tertiary"
        size="sm"
        icon="RefreshCw"
        aria-label={generating ?? t("card.refreshLabel")}
        loading={generating != null}
        onClick={onRefresh}
      >
        {generating ?? t("card.refresh")}
      </Button>
      {m && review && review.score != null && (
        <div style={s.scoreCol}>
          <CircularScore score={review.score} size={52} stroke={5} />
          <span style={s.scoreLabel}>{tp("verdict.prScore")}</span>
        </div>
      )}
    </div>
  );
}
