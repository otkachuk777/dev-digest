"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "./diff-viewer";
import { usePrComments, useCreatePrComment, useSmartDiff } from "@/lib/api/reviews";
import { useDiffFindings } from "./useDiffFindings";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff } = useSmartDiff(prId);
  const { byPath, hasReviews, onAction } = useDiffFindings(prId);

  const [order, setOrder] = React.useState<"smart" | "original">("smart");
  // GitHub comments start hidden; Smart Diff findings start visible (approved decision).
  const [visible, setVisible] = React.useState({ github: false, findings: true });

  const commentCount = comments?.length ?? 0;
  const findingsTotal = React.useMemo(
    () => [...byPath.values()].reduce((sum, list) => sum + list.length, 0),
    [byPath],
  );
  const anyVisible = visible.github || visible.findings;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments: visible.github,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setVisible((v) => ({ ...v, github: true })); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!hasReviews && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {t("smartDiff.noReviewYet")}
              </span>
            )}
            <div role="group" aria-label="File order" style={{ display: "flex", gap: 2, padding: 2, border: "1px solid var(--border)", borderRadius: 8 }}>
            <Button
              kind="tertiary"
              size="sm"
              active={order === "smart"}
              aria-pressed={order === "smart"}
              onClick={() => setOrder("smart")}
            >
              {t("smartDiff.smartOrder")}
            </Button>
            <Button
              kind="tertiary"
              size="sm"
              active={order === "original"}
              aria-pressed={order === "original"}
              onClick={() => setOrder("original")}
            >
              {t("smartDiff.originalOrder")}
            </Button>
            </div>
            {(commentCount > 0 || findingsTotal > 0) && (
              <Button
                kind="ghost"
                size="sm"
                icon={anyVisible ? "EyeOff" : "Eye"}
                onClick={() => setVisible({ github: !anyVisible, findings: !anyVisible })}
              >
                {anyVisible ? "Hide comments" : "Show comments"} ({commentCount + findingsTotal})
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      <DiffViewer
        files={files}
        commenting={commenting}
        findings={{ byPath, show: visible.findings, onAction }}
        groups={order === "smart" ? smartDiff?.groups : undefined}
      />
    </section>
  );
}
