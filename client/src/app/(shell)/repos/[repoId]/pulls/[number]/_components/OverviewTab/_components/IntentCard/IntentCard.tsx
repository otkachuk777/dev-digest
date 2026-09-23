/* IntentCard — Overview's "why is this PR here" card. Presentational + its own
   data (fetch, re-derive) since it's the sole consumer of both hooks. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Badge, Button, EmptyState, Skeleton } from "@devdigest/ui";
import { useIntent, useRederiveIntent } from "@/lib/api/reviews";
import { CONFIDENCE_META } from "./constants";
import { shortSha } from "./helpers";
import { isIntentStale } from "./model";
import { s } from "./styles";

export function IntentCard({
  prId,
  headSha,
}: {
  prId: string | null | undefined;
  headSha: string;
}) {
  const t = useTranslations("brief");
  const { data: intent, isLoading } = useIntent(prId);
  const rederive = useRederiveIntent(prId);

  if (isLoading) {
    return (
      <div style={s.card} role="status" aria-busy="true">
        <Skeleton height={120} />
      </div>
    );
  }

  if (!intent) {
    return (
      <Card style={s.card}>
        <EmptyState
          icon="Sparkles"
          title={t("block.intent")}
          body={t("intent.empty")}
          cta={t("intent.derive")}
          onCta={() => rederive.mutate()}
          ctaLoading={rederive.isPending}
        />
      </Card>
    );
  }

  const stale = isIntentStale(intent, headSha);
  const confidence = CONFIDENCE_META[intent.confidence];

  return (
    <Card style={s.card}>
      <SectionLabel
        icon="Sparkles"
        right={
          <Button
            kind="tertiary"
            size="sm"
            icon="RefreshCw"
            onClick={() => rederive.mutate()}
            loading={rederive.isPending}
          >
            {t("intent.rederive")}
          </Button>
        }
      >
        {t("block.intent")}
      </SectionLabel>

      <div style={s.headerRow}>
        <Badge color={confidence.color} bg={confidence.bg}>
          {t(`intent.confidence.${intent.confidence}`)}
        </Badge>
        {stale && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("intent.stale")}
          </Badge>
        )}
      </div>

      <p style={s.summary}>&ldquo;{intent.summary}&rdquo;</p>

      <div style={s.columns}>
        <div>
          <div style={s.columnTitle}>{t("intent.inScope")}</div>
          <ul style={s.list}>
            {intent.in_scope.map((item, i) => (
              <li key={i} style={s.listItem}>
                <span style={{ color: "var(--ok)" }}>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div style={s.columnTitle}>{t("intent.outOfScope")}</div>
          <ul style={s.list}>
            {intent.out_of_scope.map((item, i) => (
              <li key={i} style={s.listItem}>
                <span style={{ color: "var(--text-muted)" }}>✗</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {intent.sources.length > 0 && (
        <div>
          <div style={s.columnTitle}>{t("intent.sources")}</div>
          <div style={s.sourcesRow}>
            {intent.sources.map((source, i) => (
              <Badge key={i} color="var(--text-secondary)">
                {t(`intent.sourceKind.${source.kind}`)}: {source.ref}
                {source.status === "unavailable" ? ` (${t("intent.unavailable")})` : ""}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {intent.missing_context.length > 0 && (
        <div>
          <div style={s.columnTitle}>{t("intent.missingContext")}</div>
          <ul style={s.list}>
            {intent.missing_context.map((item, i) => (
              <li key={i} style={s.listItem}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={s.metaRow}>
        <span style={s.modelLine}>
          {t("intent.derivedWith", { model: intent.model, sha: shortSha(intent.head_sha) })}
        </span>
      </div>
    </Card>
  );
}
