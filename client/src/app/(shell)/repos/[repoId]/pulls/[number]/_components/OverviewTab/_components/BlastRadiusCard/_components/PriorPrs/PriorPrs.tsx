"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, MonoLink, Skeleton } from "@devdigest/ui";
import { usePriorPrs } from "@/lib/api/blast";
import { githubPrUrl } from "../../../../../../_lib/github-urls";
import { s } from "./styles";

export function PriorPrs({
  prId,
  repoFullName,
}: {
  prId: string | null | undefined;
  repoFullName: string | null;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(false);
  const { data, isLoading, isError } = usePriorPrs(prId, open);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <div style={s.wrap}>
      <button
        type="button"
        style={s.header}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Chevron size={14} />
        {t("history.title")}
        {data && data.history.length > 0 && <Badge>{data.history.length}</Badge>}
      </button>

      {open && (
        <>
          {isLoading && <Skeleton height={60} />}
          {!isLoading && isError && (
            <div style={s.itemMeta}>{t("history.error")}</div>
          )}
          {!isLoading && !isError && data && data.history.length === 0 && (
            <div style={s.itemMeta}>{t("history.empty")}</div>
          )}
          {!isLoading && !isError && data && data.history.length > 0 && (
            <div style={s.list}>
              {data.history.map((pr) => (
                <div key={pr.pr_number} style={s.item}>
                  {repoFullName ? (
                    <MonoLink href={githubPrUrl(repoFullName, pr.pr_number)}>
                      #{pr.pr_number}
                    </MonoLink>
                  ) : (
                    <span className="mono">#{pr.pr_number}</span>
                  )}
                  <span style={s.itemTitle}>{pr.title}</span>
                  <div style={s.itemMeta}>
                    {t("history.meta", { date: pr.merged_at.slice(0, 10), author: pr.author })}
                    {" · "}
                    {t("history.overlap", { count: pr.files_overlap.length })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
