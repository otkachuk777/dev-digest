"use client";

import React from "react";
import { Markdown, SectionLabel } from "@devdigest/ui";
import { BriefCard } from "./_components/BriefCard";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  headSha: string;
  prBody: string | null | undefined;
  repoId: string;
  repoFullName: string | null;
  /** Paths of the PR's files — Review focus / risk refs outside it toast instead of navigating. */
  prFiles: string[];
  onOpenInDiff: (file: string, line?: number | null) => void;
}

export function OverviewTab({
  prId,
  headSha,
  prBody,
  repoId,
  repoFullName,
  prFiles,
  onOpenInDiff,
}: OverviewTabProps) {
  return (
    <>
      <BriefCard prId={prId} headSha={headSha} prFiles={prFiles} onOpenInDiff={onOpenInDiff} />
      <IntentCard prId={prId} headSha={headSha} />
      <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>
            <Markdown>{prBody}</Markdown>
          </div>
        </section>
      )}
    </>
  );
}
