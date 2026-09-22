"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { ShellCrumb } from "@/components/app-shell";
import { ApiError } from "@/lib/api/client";
import {
  useConventions,
  useExtractConventions,
  useRejectConvention,
  useUpdateConvention,
} from "@/lib/api/conventions";
import { useActiveRepo } from "@/lib/repo-context";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillFromConventionsModal } from "../CreateSkillFromConventionsModal";
import { SKELETON_CARDS } from "./constants";
import { acceptedOf, scanWhen } from "./helpers";
import { s } from "./styles";

/** Conventions screen: scan a repo, review each candidate, merge the accepted ones into a skill. */
export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const { activeRepo } = useActiveRepo();
  const repoName = activeRepo?.full_name ?? t("page.repoFallback");

  const scan = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const reject = useRejectConvention(repoId);
  const [modalOpen, setModalOpen] = React.useState(false);

  const items = scan.data?.items ?? [];
  const accepted = acceptedOf(items);
  const hasItems = items.length > 0;
  const setAll = (value: boolean) =>
    items.filter((c) => c.accepted !== value).forEach((c) => update.mutate({ id: c.id, patch: { accepted: value } }));
  const errorText = (e: unknown) => (e instanceof ApiError ? e.message : t("page.extractionFailed"));

  return (
    <>
      <ShellCrumb items={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]} />
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repo}>
                {activeRepo?.name ?? repoName}
              </span>
            </h1>
            <p style={s.subtitle}>
              {scan.data && hasItems
                ? t("page.subtitleScan", {
                    count: scan.data.sample_count,
                    when: scanWhen(scan.data.scanned_at),
                  })
                : t("page.subtitle")}
            </p>
          </div>
          <div style={s.scanButtons}>
            <Button
              kind="primary"
              size="sm"
              icon="Sparkles"
              disabled={hasItems || extract.isPending}
              loading={extract.isPending && !hasItems}
              onClick={() => extract.mutate()}
            >
              {extract.isPending && !hasItems ? t("page.scanning") : t("page.runScan")}
            </Button>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              disabled={!hasItems || extract.isPending}
              loading={extract.isPending && hasItems}
              onClick={() => extract.mutate()}
            >
              {t("page.rescan")}
            </Button>
          </div>
        </div>

        {hasItems && (
          <div style={s.toolbar}>
            <Button
              kind="ghost"
              size="sm"
              icon={accepted.length === items.length ? "X" : "Check"}
              onClick={() => setAll(accepted.length !== items.length)}
            >
              {accepted.length === items.length ? t("page.deselectAll") : t("page.acceptAll")}
            </Button>
            <span style={s.count}>
              {t("page.acceptedCount", { accepted: accepted.length, total: items.length })}
            </span>
            <div style={s.spacer} />
            {accepted.length > 0 && (
              <Button kind="primary" size="sm" icon="Sparkles" onClick={() => setModalOpen(true)}>
                {t("page.createSkill")}
              </Button>
            )}
          </div>
        )}

        {extract.isError && (
          <ErrorState
            title={t("page.extractionFailed")}
            body={errorText(extract.error)}
            onRetry={() => extract.mutate()}
          />
        )}

        {scan.isLoading ? (
          Array.from({ length: SKELETON_CARDS }).map((_, i) => <Skeleton key={i} height={170} style={s.skeleton} />)
        ) : scan.isError ? (
          <ErrorState title={t("page.loadError")} body={errorText(scan.error)} onRetry={() => scan.refetch()} />
        ) : !hasItems && !extract.isError ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => extract.mutate()}
            ctaLoading={extract.isPending}
          />
        ) : (
          items.map((item) => (
            <ConventionCard
              key={item.id}
              item={item}
              onToggleAccepted={(value) => update.mutate({ id: item.id, patch: { accepted: value } })}
              onSaveRule={(rule) => update.mutate({ id: item.id, patch: { rule } })}
              onReject={() => reject.mutate(item.id)}
            />
          ))
        )}
      </div>

      {modalOpen && (
        <CreateSkillFromConventionsModal
          conventions={accepted}
          repoName={activeRepo?.name ?? repoName}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
