/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline.
   Optional Smart Diff grouping (`groups`): renders each role's FileCards
   under a sticky SmartDiffGroup header instead of one flat list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile, SmartDiff } from "@devdigest/shared";
import { type DiffCommentApi } from "../comments";
import { type DiffFindingsApi } from "../findings";
import { s } from "../styles";
import { FileCard } from "../FileCard";
import { SmartDiffGroup } from "../SmartDiffGroup";

export function DiffViewer({
  files,
  commenting,
  findings,
  groups,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingsApi;
  groups?: SmartDiff["groups"];
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }

  if (groups) {
    const grouped = new Set(groups.flatMap((g) => g.files.map((f) => f.path)));
    return (
      <div style={s.list}>
        {groups.map((group) => {
          const groupFiles = files.filter((f) =>
            group.files.some((gf) => gf.path === f.path),
          );
          if (groupFiles.length === 0) return null;
          const filesWithFindings = groupFiles.filter(
            (f) => (findings?.byPath.get(f.path)?.length ?? 0) > 0,
          ).length;
          return (
            <SmartDiffGroup
              key={group.role}
              role={group.role}
              fileCount={groupFiles.length}
              filesWithFindings={filesWithFindings}
            >
              {groupFiles.map((f) => (
                <FileCard key={f.path} file={f} commenting={commenting} findings={findings} />
              ))}
            </SmartDiffGroup>
          );
        })}
        {files
          .filter((f) => !grouped.has(f.path))
          .map((f) => (
            <FileCard key={f.path} file={f} commenting={commenting} findings={findings} />
          ))}
      </div>
    );
  }

  return (
    <div style={s.list}>
      {files.map((f) => (
        <FileCard key={f.path} file={f} commenting={commenting} findings={findings} />
      ))}
    </div>
  );
}
