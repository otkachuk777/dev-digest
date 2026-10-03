/* BriefCard — the Overview's PR Brief: banner (latest verdict + summary + Refresh),
   risk chips, review focus, missing-data chips and a caption. Model text is untrusted:
   rendered as plain text only, never as Markdown. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Badge, Button, EmptyState, MonoLink, Skeleton } from "@devdigest/ui";
import { useBrief, useGenerateBrief } from "@/lib/api/brief";
import { usePrReviews, useRederiveIntent } from "@/lib/api/reviews";
import { formatCost, formatTokens } from "@/lib/format";
import { notify } from "@/lib/toast";
import { BriefBanner } from "./_components/BriefBanner";
import { RiskChip } from "./_components/RiskChip";
import { errorCopyKey, isBriefStale, latestReview, parseRef } from "./model";
import { s } from "./styles";

export function BriefCard({
  prId,
  headSha,
  prFiles,
  onOpenInDiff,
}: {
  prId: string | null | undefined;
  headSha: string;
  prFiles: string[];
  onOpenInDiff: (file: string, line?: number | null) => void;
}) {
  const t = useTranslations("brief.card");
  const tb = useTranslations("brief");
  const { data: brief, isLoading } = useBrief(prId);
  const { data: reviews } = usePrReviews(prId);
  const gen = useGenerateBrief(prId, (e) => {
    const key = errorCopyKey(e);
    notify.error(key ? t(`toast.${key}`) : e instanceof Error ? e.message : String(e));
  });
  const rederive = useRederiveIntent(prId);
  const [open, setOpen] = React.useState<number | null>(null);
  // A new brief (Refresh) has different risks — the old index would point at the wrong one.
  React.useEffect(() => setOpen(null), [brief?.generated_at]);

  // Live "Generating… Ns" counter.
  const [seconds, setSeconds] = React.useState(0);
  React.useEffect(() => {
    if (!gen.isPending) return;
    const start = Date.now();
    setSeconds(0);
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [gen.isPending]);

  const generate = () => {
    if (gen.isPending) return;
    gen.mutate();
  };
  const goto = (file: string, line: number | null) =>
    prFiles.includes(file) ? onOpenInDiff(file, line) : notify.info(t("toast.notInDiff"));
  const gotoRef = (ref: string) => {
    const { file, line } = parseRef(ref);
    goto(file, line);
  };
  const generating = gen.isPending ? t("generating", { seconds }) : null;

  const skeleton = (
    <Card>
      <div role="status" aria-busy="true" aria-label={generating ?? undefined}>
        {["92%", "86%", "74%", "60%"].map((w) => (
          <Skeleton key={w} height={10} width={w} style={{ marginBottom: 9 }} />
        ))}
      </div>
    </Card>
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div role="status" aria-busy="true">
        <Skeleton height={120} />
      </div>
    );
  } else if (!brief) {
    body = (
      <>
        <Card style={s.empty}>
          <EmptyState
            icon="FileText"
            title={t("empty.title")}
            body={t("empty.body")}
            cta={generating ?? t("generate")}
            onCta={generate}
            ctaLoading={gen.isPending}
          />
        </Card>
        {gen.isPending && skeleton}
      </>
    );
  } else {
    body = (
      <div style={s.stack}>
        <BriefBanner
          review={latestReview(reviews)}
          summary={brief.summary}
          stale={isBriefStale(brief, headSha)}
          generating={generating}
          onRefresh={generate}
        />
        {gen.isPending ? (
          skeleton
        ) : (
          <>
            {brief.missing.length > 0 && (
              <div style={s.chips}>
                {brief.missing.map((m) => (
                  <Badge key={m} color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
                    {t(`missing.${m}`)}
                  </Badge>
                ))}
                {brief.missing.includes("intent") && (
                  <Button
                    kind="tertiary"
                    size="sm"
                    onClick={() => rederive.mutate()}
                    loading={rederive.isPending}
                  >
                    {t("missing.derive")}
                  </Button>
                )}
              </div>
            )}

            <Card>
              <SectionLabel icon="AlertTriangle">{t("risks.heading")}</SectionLabel>
              {brief.risks.risks.length === 0 ? (
                <p style={s.muted}>{tb("noRisks")}</p>
              ) : (
                <div style={s.chips}>
                  {brief.risks.risks.map((r, i) => (
                    <RiskChip
                      key={i}
                      risk={r}
                      expanded={open === i}
                      onToggle={() => setOpen(open === i ? null : i)}
                      onGoto={gotoRef}
                    />
                  ))}
                </div>
              )}
              {open != null && brief.risks.risks[open] && (
                <div style={{ ...s.block, marginTop: 10 }}>
                  <div style={s.focusReason}>{brief.risks.risks[open].explanation}</div>
                  <div style={{ ...s.chips, marginTop: 8 }}>
                    {brief.risks.risks[open].file_refs.map((ref) => (
                      <MonoLink key={ref} onClick={() => gotoRef(ref)}>
                        {ref}
                      </MonoLink>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <section style={s.block}>
              <div style={s.focusHead}>
                <span style={s.focusTitle}>{t("focus.heading")}</span>
                <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                  {t("focus.count", { count: brief.review_focus.length })}
                </Badge>
              </div>
              {brief.review_focus.length === 0 ? (
                <p style={s.muted}>{t("focus.empty")}</p>
              ) : (
                <ol style={s.focusList}>
                  {brief.review_focus.map((it, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        style={s.focusItem}
                        aria-label={t("focus.open", { file: it.file, line: it.line })}
                        onClick={() => goto(it.file, it.line)}
                      >
                        <span aria-hidden style={s.focusArrow}>
                          ▸
                        </span>
                        <span className="mono" style={s.focusRef}>
                          {it.file}:{it.line}
                        </span>
                        <span style={s.focusReason}>— {it.reason}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <div style={s.caption}>
              {t("caption", {
                model: brief.model,
                sha: brief.head_sha.slice(0, 7),
                cost: formatCost(brief.cost_usd),
                tokens: formatTokens(brief.tokens_in, brief.tokens_out),
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <section style={s.section}>
      <SectionLabel icon="FileText">{t("title")}</SectionLabel>
      {body}
    </section>
  );
}
