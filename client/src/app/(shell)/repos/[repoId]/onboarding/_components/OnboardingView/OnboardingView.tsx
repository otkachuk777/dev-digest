/* OnboardingView — read, generate and regenerate the five-section onboarding tour. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Onboarding, OnboardingGenerateResult } from "@devdigest/shared";
import { ShellCrumb } from "@/components/app-shell";
import { ApiError } from "@/lib/api/client";
import { onboardingKeys, useGenerateOnboarding, useOnboarding } from "@/lib/api/onboarding";
import { useRefreshRepo } from "@/lib/api/repos";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { tourToMarkdown } from "../../_lib/tour";
import { RepoNotFound } from "../../../_components/RepoNotFound";
import { StatusBanner, useBannerLines } from "../StatusBanner";
import { SECTION_KEYS } from "./constants";
import { TourBody, TourToc } from "./TourBody";
import { useCopy } from "./useCopy";
import { b } from "./bodyStyles";
import { s } from "./styles";

type Failed = NonNullable<OnboardingGenerateResult["failed_attempt"]>;

export function OnboardingView({ repoId }: { repoId: string }) {
  const t = useTranslations("onboarding");
  const format = useFormatter();
  const qc = useQueryClient();
  const toast = useToast();
  const { activeRepo } = useActiveRepo();
  const state = useOnboarding(repoId);
  const gen = useGenerateOnboarding(repoId);
  const refresh = useRefreshRepo();
  const { copy, copied } = useCopy();

  const [failed, setFailed] = React.useState<Failed | null>(null);
  const [skeleton, setSkeleton] = React.useState<Onboarding | null>(null); // shown, never stored
  const [inProgress, setInProgress] = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);
  const sending = React.useRef(false);

  // Live "Generating… Ns" counter.
  const [seconds, setSeconds] = React.useState(0);
  React.useEffect(() => {
    if (!gen.isPending) return;
    const start = Date.now();
    setSeconds(0);
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [gen.isPending]);

  const data = state.data;
  const tour = skeleton ?? data?.tour ?? null;
  const bannerLines = useBannerLines(tour);

  const generate = () => {
    if (sending.current) return;
    sending.current = true;
    setFailed(null);
    setSkeleton(null);
    setInProgress(false);
    gen.mutate(undefined, {
      onSuccess: (res) => setFailed(res.failed_attempt),
      onError: (e) => {
        const code = e instanceof ApiError ? e.code : undefined;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else if (code === "generation_in_progress") setInProgress(true);
        else if (code === "no_clone") void qc.invalidateQueries({ queryKey: onboardingKeys.state(repoId) });
        else toast.error(e.message);
      },
      onSettled: () => {
        sending.current = false;
      },
    });
  };

  if (notFound || (state.error instanceof ApiError && state.error.status === 404)) return <RepoNotFound />;
  if (state.isLoading) return <Skeleton height={200} />;
  if (state.isError || !data) return <ErrorState title={t("loadError.title")} />;

  if (!tour && !gen.isPending) {
    return data.clone_status === "no_clone" ? (
      <EmptyState
        icon="GitBranch"
        title={t("noClone.title")}
        body={t("noClone.body")}
        cta={t("noClone.cta")}
        onCta={() => refresh.mutate(repoId)}
      />
    ) : (
      <>
        <EmptyState
          icon="Sparkles"
          title={t("empty.title")}
          body={
            <>
              <p>{t("empty.body")}</p>
              <p>{t("empty.cost", { provider: data.model.provider, model: data.model.model })}</p>
            </>
          }
          cta={t("empty.cta")}
          onCta={generate}
        />
        {inProgress && <p role="alert" style={{ textAlign: "center" }}>{t("inProgress")}</p>}
      </>
    );
  }

  const repoName = activeRepo?.name ?? (tour?.repo_full_name ?? "").split("/").pop() ?? "";
  const [headPre = "", headPost = ""] = t("heading", { repo: "\u0000" }).split("\u0000");
  const meta = tour
    ? t("meta", {
        total: tour.files_total,
        indexed: tour.files_indexed,
        when: format.relativeTime(new Date(tour.generated_at), Date.now()),
      })
    : "";
  const stale = !!tour && data.current_commit_sha != null && data.current_commit_sha !== tour.commit_sha;

  const copyMarkdown = async () => {
    if (!tour) return;
    const md = tourToMarkdown(tour, {
      heading: t("heading", { repo: tour.repo_full_name }),
      headerLine: meta,
      bannerLines,
      sectionTitles: SECTION_KEYS.map((k) => t(`sections.${k}`)),
    });
    if (await copy(md)) toast.success(t("copiedMarkdown"));
  };

  const head = (
    <>
      <div style={s.header}>
        <div style={s.headText}>
          <h1 style={s.title}>
            {headPre}
            <span className="mono" style={s.repo}>
              {repoName}
            </span>
            {headPost}
          </h1>
          {tour && <p style={s.meta}>{meta}</p>}
        </div>
        <div style={s.actions}>
          {stale && <Badge>{t("stale")}</Badge>}
          <Button kind="ghost" size="sm" icon="RefreshCw" disabled={gen.isPending} onClick={generate}>
            {gen.isPending ? t("generating", { seconds }) : t("regenerate")}
          </Button>
          <Button kind="secondary" size="sm" icon="Copy" disabled={gen.isPending || !tour} onClick={copyMarkdown}>
            {t("copyMarkdown")}
          </Button>
        </div>
      </div>

      {inProgress && (
        <div role="alert" style={s.notice}>
          {t("inProgress")}
        </div>
      )}
      {failed && !skeleton && !gen.isPending && (
        <div role="alert" style={s.notice}>
          <span>
            {t("failed.notice", {
              reason: t(`reasons.${failed.reason}`, { provider: data.model.provider }),
            })}
          </span>
          <Button size="sm" kind="ghost" onClick={() => setSkeleton(failed.skeleton)}>
            {t("failed.showSkeleton")}
          </Button>
        </div>
      )}
      {!gen.isPending && tour && <StatusBanner tour={tour} />}
    </>
  );

  return (
    <div style={s.page}>
      <ShellCrumb items={[{ label: tour?.repo_full_name ?? repoName, mono: true }, { label: t("crumb") }]} />
      <div style={b.layout}>
        {!gen.isPending && tour && <TourToc />}
        <div style={b.main}>
          {head}
          {gen.isPending || !tour ? (
            <div style={s.stack}>
              {SECTION_KEYS.map((k) => (
                <Skeleton key={k} height={72} />
              ))}
            </div>
          ) : (
            <TourBody tour={tour} copied={copied} onCopy={(text, key) => void copy(text, key)} />
          )}
        </div>
      </div>
      <span aria-live="polite" style={s.live}>
        {copied ? t("copied") : ""}
      </span>
    </div>
  );
}
