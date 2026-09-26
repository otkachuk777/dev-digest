/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { PrFile } from "@devdigest/shared";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  cs,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { partitionFindings, topSeverity, type DiffFindingsApi } from "../findings";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { FindingCard } from "../../../FindingCard";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findings,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingsApi;
}) {
  const t = useTranslations("shell");
  const tFindings = useTranslations("prReview");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Every rendered line's keys (RIGHT/LEFT), shared by comment threads and findings.
  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  const fileFindings = findings?.byPath.get(file.path) ?? [];
  const { matched: matchedFindings, unanchored: unanchoredFindings } = React.useMemo(
    () => partitionFindings(fileFindings, renderedKeys),
    [fileFindings, renderedKeys],
  );

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;
  const fileTopSeverity = topSeverity(fileFindings);

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        {fileFindings.length > 0 && fileTopSeverity && (
          <span
            title={tFindings("verdict.findingsCount", { count: fileFindings.length })}
            aria-label={tFindings("verdict.findingsCount", { count: fileFindings.length })}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: SEV[fileTopSeverity].c,
              flexShrink: 0,
            }}
          />
        )}
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            // Index key: `lines` is parsePatch's output for one immutable patch
            // — never reordered, filtered or appended to. A composite of
            // kind/oldNo/newNo is NOT unique here: hunk headers carry no line
            // numbers, so every "@@" line in a multi-hunk file collides.
            lines.map((ln, i) => {
              const [k] = keysForLine(ln);
              return (
                <CodeLine
                  key={i}
                  ln={ln}
                  path={file.path}
                  threads={threadsForLine(ln, matched)}
                  commenting={commenting}
                  findings={findings?.show && k ? matchedFindings.get(k) : undefined}
                  onFindingAction={findings?.onAction}
                />
              );
            })
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findings && findings.show && unanchoredFindings.length > 0 && (
            <div style={cs.outdatedWrap}>
              <span style={cs.outdatedTitle}>
                {tFindings("smartDiff.unanchoredFindings", { count: unanchoredFindings.length })}
              </span>
              {unanchoredFindings.map((f) => (
                <FindingCard
                  key={f.id}
                  f={f}
                  defaultExpanded
                  onAction={(a) => findings.onAction(f.id, a)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
