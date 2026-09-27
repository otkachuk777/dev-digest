"use client";

import React from "react";
import { Markdown, SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  headSha: string;
  prBody: string | null | undefined;
  repoId: string;
  repoFullName: string | null;
}

export function OverviewTab({ prId, headSha, prBody, repoId, repoFullName }: OverviewTabProps) {
  return (
    <>
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
